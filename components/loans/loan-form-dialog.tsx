'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { loanSchema, type LoanInput, LOAN_TYPES } from '@/lib/validations/loans';
import { todayISO } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Loan } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: Loan | null;
}

export function LoanFormDialog({ open, onOpenChange, onSaved, editing }: Props) {
  const { currentFamily } = useFamily();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LoanInput>({
    resolver: zodResolver(loanSchema),
    defaultValues: { type: 'personal', interestRate: 0, emiAmount: 0, startDate: todayISO() },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      editing
        ? {
            type: editing.type,
            lender: editing.lender,
            principal: editing.principal,
            interestRate: editing.interest_rate,
            emiAmount: editing.emi_amount,
            tenureMonths: editing.tenure_months,
            startDate: editing.start_date,
            endDate: editing.end_date,
            outstandingBalance: editing.outstanding_balance,
            notes: editing.notes ?? '',
          }
        : { type: 'personal', interestRate: 0, emiAmount: 0, startDate: todayISO() }
    );
  }, [open, editing, reset]);

  const onSubmit = async (data: LoanInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      type: data.type,
      lender: data.lender,
      principal: data.principal,
      interest_rate: data.interestRate,
      emi_amount: data.emiAmount,
      tenure_months: data.tenureMonths ?? null,
      start_date: data.startDate,
      end_date: data.endDate || null,
      outstanding_balance: data.outstandingBalance,
      notes: data.notes || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('loans').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('loans').insert({ ...payload, family_id: currentFamily.id, created_by: user!.id }));
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
          <DialogTitle>{editing ? 'Edit Loan' : 'Add Loan / Debt'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LOAN_TYPES.map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lender">Lender</Label>
              <Input id="lender" placeholder="BRAC Bank, cousin…" {...register('lender')} />
              {errors.lender && <p className="text-sm text-destructive">{errors.lender.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="principal">Principal (৳)</Label>
              <Input id="principal" type="number" step="0.01" {...register('principal')} />
              {errors.principal && <p className="text-sm text-destructive">{errors.principal.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="outstandingBalance">Outstanding balance (৳)</Label>
              <Input id="outstandingBalance" type="number" step="0.01" {...register('outstandingBalance')} />
              {errors.outstandingBalance && <p className="text-sm text-destructive">{errors.outstandingBalance.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="interestRate">Interest %</Label>
              <Input id="interestRate" type="number" step="0.01" {...register('interestRate')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emiAmount">EMI (৳)</Label>
              <Input id="emiAmount" type="number" step="0.01" {...register('emiAmount')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenureMonths">Tenure (months)</Label>
              <Input id="tenureMonths" type="number" min={1} {...register('tenureMonths')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" type="date" {...register('startDate')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" {...register('endDate')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Update loan' : 'Add loan'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
