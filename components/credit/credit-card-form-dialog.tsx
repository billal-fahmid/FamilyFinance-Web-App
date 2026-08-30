'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { creditCardSchema, type CreditCardInput } from '@/lib/validations/credit';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { CreditCard, FamilyMember } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: CreditCard | null;
}

export function CreditCardFormDialog({ open, onOpenChange, onSaved, editing }: Props) {
  const { currentFamily } = useFamily();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreditCardInput>({
    resolver: zodResolver(creditCardSchema),
    defaultValues: { currentOutstanding: 0, annualFee: 0, interestRate: 0, creditLimit: 0 },
  });

  useEffect(() => {
    if (!open || !currentFamily) return;
    const supabase = createClient();
    supabase
      .from('family_members')
      .select('*')
      .eq('family_id', currentFamily.id)
      .eq('status', 'active')
      .then(({ data }) => setMembers((data as FamilyMember[]) ?? []));

    reset(
      editing
        ? {
            provider: editing.provider,
            cardName: editing.card_name,
            ownerMemberId: editing.owner_member_id,
            cardholderName: editing.cardholder_name ?? '',
            last4: editing.last4 ?? '',
            creditLimit: editing.credit_limit,
            currentOutstanding: editing.current_outstanding,
            statementDay: editing.statement_day,
            dueDay: editing.due_day,
            annualFee: editing.annual_fee,
            interestRate: editing.interest_rate,
            notes: editing.notes ?? '',
          }
        : { currentOutstanding: 0, annualFee: 0, interestRate: 0, creditLimit: 0 }
    );
  }, [open, currentFamily, editing, reset]);

  const onSubmit = async (data: CreditCardInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();

    const payload = {
      provider: data.provider,
      card_name: data.cardName,
      owner_member_id: data.ownerMemberId || null,
      cardholder_name: data.cardholderName || null,
      last4: data.last4 ? data.last4 : null,
      credit_limit: data.creditLimit,
      statement_day: data.statementDay ?? null,
      due_day: data.dueDay ?? null,
      annual_fee: data.annualFee,
      interest_rate: data.interestRate,
      notes: data.notes || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('credit_cards').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('credit_cards').insert({
        ...payload,
        family_id: currentFamily.id,
        current_outstanding: data.currentOutstanding ?? 0,
      }));
    }

    setIsSubmitting(false);
    if (error) return setServerError(error.message);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Credit Card' : 'Add Credit Card'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="provider">Bank / provider</Label>
              <Input id="provider" placeholder="EBL, City Bank…" {...register('provider')} />
              {errors.provider && <p className="text-sm text-destructive">{errors.provider.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cardName">Card name</Label>
              <Input id="cardName" placeholder="Visa Signature" {...register('cardName')} />
              {errors.cardName && <p className="text-sm text-destructive">{errors.cardName.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Cardholder</Label>
              <Controller
                control={control}
                name="ownerMemberId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="Family member" /></SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last4">Last 4 digits</Label>
              <Input id="last4" inputMode="numeric" maxLength={4} placeholder="1234" {...register('last4')} />
              {errors.last4 && <p className="text-sm text-destructive">{errors.last4.message}</p>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Never enter the full card number or CVV — last 4 digits only. Shown as <b>**** {'1234'}</b>.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="creditLimit">Credit limit (৳)</Label>
              <Input id="creditLimit" type="number" step="0.01" {...register('creditLimit')} />
              {errors.creditLimit && <p className="text-sm text-destructive">{errors.creditLimit.message}</p>}
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="currentOutstanding">Current outstanding (৳)</Label>
                <Input id="currentOutstanding" type="number" step="0.01" {...register('currentOutstanding')} />
                <p className="text-xs text-muted-foreground">Opening balance owed. Later changes come from transactions & payments.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="statementDay">Statement day (1–31)</Label>
              <Input id="statementDay" type="number" min={1} max={31} {...register('statementDay')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDay">Payment due day (1–31)</Label>
              <Input id="dueDay" type="number" min={1} max={31} {...register('dueDay')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="annualFee">Annual fee (৳)</Label>
              <Input id="annualFee" type="number" step="0.01" {...register('annualFee')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interestRate">Interest rate (APR %)</Label>
              <Input id="interestRate" type="number" step="0.01" {...register('interestRate')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Update card' : 'Add card'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
