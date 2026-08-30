'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { creditCardPaymentSchema, type CreditCardPaymentInput } from '@/lib/validations/credit';
import { todayISO, formatBDT } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Account, CreditCard, CreditCardStatement } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  cards: CreditCard[];
  defaultCardId?: string;
  defaultStatementId?: string;
  defaultAmount?: number;
}

export function CcPaymentDialog({
  open,
  onOpenChange,
  onSaved,
  cards,
  defaultCardId,
  defaultStatementId,
  defaultAmount,
}: Props) {
  const { currentFamily } = useFamily();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [statements, setStatements] = useState<CreditCardStatement[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreditCardPaymentInput>({
    resolver: zodResolver(creditCardPaymentSchema),
    defaultValues: { occurredOn: todayISO() },
  });

  const cardId = watch('cardId');

  useEffect(() => {
    if (!open || !currentFamily) return;
    const supabase = createClient();
    supabase
      .from('accounts')
      .select('*')
      .eq('family_id', currentFamily.id)
      .eq('is_archived', false)
      .then(({ data }) => setAccounts((data as Account[]) ?? []));

    reset({
      occurredOn: todayISO(),
      cardId: defaultCardId ?? cards[0]?.id,
      statementId: defaultStatementId ?? null,
      amount: defaultAmount as unknown as number,
    });
  }, [open, currentFamily, defaultCardId, defaultStatementId, defaultAmount, cards, reset]);

  useEffect(() => {
    if (!open || !cardId) return;
    const supabase = createClient();
    supabase
      .from('credit_card_statements')
      .select('*')
      .eq('card_id', cardId)
      .neq('status', 'paid')
      .order('statement_date', { ascending: false })
      .then(({ data }) => setStatements((data as CreditCardStatement[]) ?? []));
  }, [open, cardId]);

  const onSubmit = async (data: CreditCardPaymentInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('credit_card_payments').insert({
      family_id: currentFamily.id,
      card_id: data.cardId,
      statement_id: data.statementId || null,
      from_account_id: data.fromAccountId,
      amount: data.amount,
      occurred_on: data.occurredOn,
      notes: data.notes || null,
      created_by: user!.id,
    });

    setIsSubmitting(false);
    if (error) return setServerError(error.message);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay Credit Card Bill</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Money moves from your account to the card. The paying account balance goes down and the
            card outstanding goes down. This is <b>not</b> recorded as an expense.
          </p>

          <div className="space-y-2">
            <Label>Credit card</Label>
            <Controller
              control={control}
              name="cardId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select card" /></SelectTrigger>
                  <SelectContent>
                    {cards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.provider} {c.card_name} · owe {formatBDT(c.current_outstanding)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.cardId && <p className="text-sm text-destructive">{errors.cardId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Pay from account</Label>
            <Controller
              control={control}
              name="fromAccountId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Bank / cash / bKash / Nagad" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({formatBDT(a.current_balance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.fromAccountId && <p className="text-sm text-destructive">{errors.fromAccountId.message}</p>}
          </div>

          {statements.length > 0 && (
            <div className="space-y-2">
              <Label>Apply to statement (optional)</Label>
              <Controller
                control={control}
                name="statementId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="No specific statement" /></SelectTrigger>
                    <SelectContent>
                      {statements.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.statement_date} · due {formatBDT(s.remaining_dues)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (৳)</Label>
              <Input id="amount" type="number" step="0.01" {...register('amount')} />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="occurredOn">Date</Label>
              <Input id="occurredOn" type="date" {...register('occurredOn')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Recording payment…' : 'Record payment'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
