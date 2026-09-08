'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { creditCardStatementSchema, type CreditCardStatementInput } from '@/lib/validations/credit';
import { toLocalISODate } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CreditCard, CreditCardStatement } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  card: CreditCard;
  editing?: CreditCardStatement | null;
}

export function CcStatementDialog({ open, onOpenChange, onSaved, card, editing }: Props) {
  const { currentFamily } = useFamily();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreditCardStatementInput>({ resolver: zodResolver(creditCardStatementSchema) });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      reset({
        cardId: card.id,
        periodStart: editing.period_start,
        periodEnd: editing.period_end,
        statementDate: editing.statement_date,
        statementBalance: editing.statement_balance,
        minimumPayment: editing.minimum_payment,
        dueDate: editing.due_date,
        notes: editing.notes ?? '',
      });
      return;
    }
    // sensible defaults from the card cycle
    const today = new Date();
    const stmtDay = card.statement_day ?? today.getDate();
    const dueDay = card.due_day ?? Math.min(stmtDay + 20, 28);
    const stmtDate = new Date(today.getFullYear(), today.getMonth(), stmtDay);
    const periodStart = new Date(stmtDate);
    periodStart.setMonth(periodStart.getMonth() - 1);
    const dueDate = new Date(stmtDate);
    dueDate.setDate(1);
    dueDate.setMonth(dueDate.getMonth() + 1);
    dueDate.setDate(dueDay);
    reset({
      cardId: card.id,
      periodStart: toLocalISODate(periodStart),
      periodEnd: toLocalISODate(stmtDate),
      statementDate: toLocalISODate(stmtDate),
      statementBalance: Number(card.current_outstanding) || 0,
      minimumPayment: Math.round((Number(card.current_outstanding) || 0) * 0.05),
      dueDate: toLocalISODate(dueDate),
      notes: '',
    });
  }, [open, editing, card, reset]);

  const onSubmit = async (data: CreditCardStatementInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();

    const payload = {
      period_start: data.periodStart,
      period_end: data.periodEnd,
      statement_date: data.statementDate,
      statement_balance: data.statementBalance,
      minimum_payment: data.minimumPayment,
      due_date: data.dueDate,
      notes: data.notes || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('credit_card_statements').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('credit_card_statements').insert({
        ...payload,
        family_id: currentFamily.id,
        card_id: card.id,
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
          <DialogTitle>{editing ? 'Edit Statement' : 'New Statement'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="periodStart">Period start</Label>
              <Input id="periodStart" type="date" {...register('periodStart')} />
              {errors.periodStart && <p className="text-sm text-destructive">{errors.periodStart.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodEnd">Period end</Label>
              <Input id="periodEnd" type="date" {...register('periodEnd')} />
              {errors.periodEnd && <p className="text-sm text-destructive">{errors.periodEnd.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="statementDate">Statement date</Label>
              <Input id="statementDate" type="date" {...register('statementDate')} />
              {errors.statementDate && <p className="text-sm text-destructive">{errors.statementDate.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" type="date" {...register('dueDate')} />
              {errors.dueDate && <p className="text-sm text-destructive">{errors.dueDate.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="statementBalance">Statement balance (৳)</Label>
              <Input id="statementBalance" type="number" step="0.01" {...register('statementBalance')} />
              {errors.statementBalance && <p className="text-sm text-destructive">{errors.statementBalance.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="minimumPayment">Minimum payment (৳)</Label>
              <Input id="minimumPayment" type="number" step="0.01" {...register('minimumPayment')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Update statement' : 'Create statement'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
