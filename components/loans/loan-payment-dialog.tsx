'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { loanPaymentSchema, type LoanPaymentInput } from '@/lib/validations/loans';
import { todayISO, formatBDT } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Account, Loan } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  loan: Loan | null;
}

export function LoanPaymentDialog({ open, onOpenChange, onSaved, loan }: Props) {
  const { currentFamily } = useFamily();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LoanPaymentInput>({ resolver: zodResolver(loanPaymentSchema), defaultValues: { paidOn: todayISO() } });

  useEffect(() => {
    if (!open || !currentFamily || !loan) return;
    const supabase = createClient();
    supabase
      .from('accounts')
      .select('*')
      .eq('family_id', currentFamily.id)
      .eq('is_archived', false)
      .then(({ data }) => setAccounts((data as Account[]) ?? []));

    reset({
      loanId: loan.id,
      accountId: null,
      amount: loan.emi_amount || undefined,
      paidOn: todayISO(),
      notes: '',
    });
  }, [open, currentFamily, loan, reset]);

  const onSubmit = async (data: LoanPaymentInput) => {
    if (!currentFamily || !loan) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('loan_payments').insert({
      family_id: currentFamily.id,
      loan_id: loan.id,
      account_id: data.accountId || null,
      amount: data.amount,
      principal_component: data.principalComponent ?? null,
      interest_component: data.interestComponent ?? null,
      paid_on: data.paidOn,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Loan Payment — {loan?.lender}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Reduces the paying account balance and the loan outstanding. If you enter a principal
            component, only that part reduces the outstanding balance.
          </p>

          <div className="space-y-2">
            <Label>Pay from account</Label>
            <Controller
              control={control}
              name="accountId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (৳)</Label>
              <Input id="amount" type="number" step="0.01" {...register('amount')} />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="paidOn">Date</Label>
              <Input id="paidOn" type="date" {...register('paidOn')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="principalComponent">Principal part (৳)</Label>
              <Input id="principalComponent" type="number" step="0.01" placeholder="Optional" {...register('principalComponent')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interestComponent">Interest part (৳)</Label>
              <Input id="interestComponent" type="number" step="0.01" placeholder="Optional" {...register('interestComponent')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Recording…' : 'Record payment'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
