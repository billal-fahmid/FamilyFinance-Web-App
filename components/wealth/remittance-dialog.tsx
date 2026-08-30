'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { remittanceSchema, type RemittanceInput } from '@/lib/validations/wealth';
import { todayISO, formatBDT } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Account, FamilyMember } from '@/types/database';

const COUNTRIES = ['Saudi Arabia', 'UAE', 'Qatar', 'Kuwait', 'Oman', 'Bahrain', 'Malaysia', 'Singapore', 'USA', 'UK', 'Italy', 'Other'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function RemittanceDialog({ open, onOpenChange, onSaved }: Props) {
  const { currentFamily } = useFamily();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<RemittanceInput>({
    resolver: zodResolver(remittanceSchema),
    defaultValues: { receivedOn: todayISO(), foreignCurrency: 'SAR' },
  });

  const fx = Number(watch('foreignAmount')) || 0;
  const rate = Number(watch('exchangeRate')) || 0;
  const bdt = useMemo(() => fx * rate, [fx, rate]);

  useEffect(() => {
    if (!open || !currentFamily) return;
    const supabase = createClient();
    supabase.from('accounts').select('*').eq('family_id', currentFamily.id).eq('is_archived', false)
      .then(({ data }) => setAccounts((data as Account[]) ?? []));
    supabase.from('family_members').select('*').eq('family_id', currentFamily.id).eq('status', 'active')
      .then(({ data }) => setMembers((data as FamilyMember[]) ?? []));
    reset({ receivedOn: todayISO(), foreignCurrency: 'SAR' });
  }, [open, currentFamily, reset]);

  const onSubmit = async (data: RemittanceInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const bdtAmount = Math.round(data.foreignAmount * data.exchangeRate * 100) / 100;

    // 1. income row (credits the receiving account via the existing trigger)
    const { data: income, error: incErr } = await supabase
      .from('income')
      .insert({
        family_id: currentFamily.id,
        account_id: data.accountId,
        person_id: data.personId || null,
        category_key: 'remittance',
        amount: bdtAmount,
        occurred_on: data.receivedOn,
        source: `${data.senderName} · ${data.country}`,
        notes: data.notes || null,
        created_by: user!.id,
      })
      .select()
      .single();

    if (incErr || !income) {
      setIsSubmitting(false);
      return setServerError(incErr?.message ?? 'Could not save');
    }

    // 2. FX detail
    const { error: remErr } = await supabase.from('remittances').insert({
      family_id: currentFamily.id,
      income_id: income.id,
      sender_name: data.senderName,
      country: data.country,
      foreign_currency: data.foreignCurrency.toUpperCase(),
      foreign_amount: data.foreignAmount,
      exchange_rate: data.exchangeRate,
      notes: data.notes || null,
    });

    if (remErr) {
      await supabase.from('income').delete().eq('id', income.id);
      setIsSubmitting(false);
      return setServerError(remErr.message);
    }

    setIsSubmitting(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Remittance</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="senderName">Sender</Label>
              <Input id="senderName" placeholder="Karim (brother)" {...register('senderName')} />
              {errors.senderName && <p className="text-sm text-destructive">{errors.senderName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Controller
                control={control}
                name="country"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.country && <p className="text-sm text-destructive">{errors.country.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="foreignCurrency">Currency</Label>
              <Input id="foreignCurrency" placeholder="SAR" {...register('foreignCurrency')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="foreignAmount">Amount</Label>
              <Input id="foreignAmount" type="number" step="0.01" {...register('foreignAmount')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exchangeRate">Rate (৳)</Label>
              <Input id="exchangeRate" type="number" step="0.0001" placeholder="31.50" {...register('exchangeRate')} />
            </div>
          </div>
          {(errors.foreignAmount || errors.exchangeRate) && (
            <p className="text-sm text-destructive">Enter a valid amount and exchange rate.</p>
          )}

          <div className="rounded-md bg-primary/5 p-3 text-center">
            <p className="text-xs text-muted-foreground">Received in BDT</p>
            <p className="text-lg font-semibold tabular-nums text-primary">{formatBDT(bdt)}</p>
            <p className="text-[11px] text-muted-foreground">Added as income (category: Remittance)</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Receiving account</Label>
              <Controller
                control={control}
                name="accountId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.accountId && <p className="text-sm text-destructive">{errors.accountId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="receivedOn">Date received</Label>
              <Input id="receivedOn" type="date" {...register('receivedOn')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Received by (optional)</Label>
            <Controller
              control={control}
              name="personId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                  <SelectTrigger><SelectValue placeholder="Family member" /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Record remittance'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
