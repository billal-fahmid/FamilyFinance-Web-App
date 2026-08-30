'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import {
  creditCardTxnSchema,
  type CreditCardTxnInput,
  CREDIT_CARD_TXN_TYPES,
} from '@/lib/validations/credit';
import { todayISO } from '@/lib/utils';
import { CC_TXN_LABELS } from '@/lib/finance';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Category, CreditCardTransaction, FamilyMember } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  cardId: string;
  editing?: CreditCardTransaction | null;
}

export function CcTransactionDialog({ open, onOpenChange, onSaved, cardId, editing }: Props) {
  const { currentFamily } = useFamily();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreditCardTxnInput>({
    resolver: zodResolver(creditCardTxnSchema),
    defaultValues: { occurredOn: todayISO(), type: 'purchase', cardId },
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
    supabase
      .from('categories')
      .select('*')
      .eq('type', 'expense')
      .then(({ data }) => setCategories((data as Category[]) ?? []));

    reset(
      editing
        ? {
            cardId,
            type: editing.type,
            amount: editing.amount,
            occurredOn: editing.occurred_on,
            merchant: editing.merchant ?? '',
            categoryKey: editing.category_key ?? '',
            personId: editing.person_id,
            notes: editing.notes ?? '',
            receiptUrl: editing.receipt_url ?? '',
          }
        : { occurredOn: todayISO(), type: 'purchase', cardId }
    );
  }, [open, currentFamily, editing, cardId, reset]);

  const onSubmit = async (data: CreditCardTxnInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      type: data.type,
      amount: data.amount,
      occurred_on: data.occurredOn,
      merchant: data.merchant || null,
      category_key: data.categoryKey || null,
      person_id: data.personId || null,
      notes: data.notes || null,
      receipt_url: data.receiptUrl || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('credit_card_transactions').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('credit_card_transactions').insert({
        ...payload,
        family_id: currentFamily.id,
        card_id: cardId,
        created_by: user!.id,
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
          <DialogTitle>{editing ? 'Edit Card Transaction' : 'Add Card Transaction'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CREDIT_CARD_TXN_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{CC_TXN_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              Purchases, fees, interest &amp; cash advances raise outstanding. Refunds &amp; adjustments lower it.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (৳)</Label>
              <Input id="amount" type="number" step="0.01" {...register('amount')} />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="occurredOn">Date</Label>
              <Input id="occurredOn" type="date" {...register('occurredOn')} />
              {errors.occurredOn && <p className="text-sm text-destructive">{errors.occurredOn.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="merchant">Merchant</Label>
            <Input id="merchant" placeholder="Daraz, Shwapno…" {...register('merchant')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Controller
                control={control}
                name="categoryKey"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Person</Label>
              <Controller
                control={control}
                name="personId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="receiptUrl">Receipt URL</Label>
            <Input id="receiptUrl" placeholder="https://…" {...register('receiptUrl')} />
            {errors.receiptUrl && <p className="text-sm text-destructive">{errors.receiptUrl.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Update' : 'Add transaction'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
