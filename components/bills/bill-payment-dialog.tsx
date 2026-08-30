'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { billPaymentSchema, type BillPaymentInput } from '@/lib/validations/bills';
import { todayISO, formatBDT } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Account, Bill } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  bill: Bill | null;
}

export function BillPaymentDialog({ open, onOpenChange, onSaved, bill }: Props) {
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
  } = useForm<BillPaymentInput>({ resolver: zodResolver(billPaymentSchema), defaultValues: { paidOn: todayISO() } });

  useEffect(() => {
    if (!open || !currentFamily || !bill) return;
    const supabase = createClient();
    supabase
      .from('accounts')
      .select('*')
      .eq('family_id', currentFamily.id)
      .eq('is_archived', false)
      .then(({ data }) => setAccounts((data as Account[]) ?? []));

    reset({
      billId: bill.id,
      accountId: bill.payment_account_id ?? null,
      amount: bill.amount,
      paidOn: todayISO(),
      notes: '',
    });
  }, [open, currentFamily, bill, reset]);

  const onSubmit = async (data: BillPaymentInput) => {
    if (!currentFamily || !bill) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('bill_payments').insert({
      family_id: currentFamily.id,
      bill_id: bill.id,
      account_id: data.accountId || null,
      amount: data.amount,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay {bill?.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Recording the payment reduces the paying account balance and rolls the bill&apos;s due date
            forward by its frequency.
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
            {errors.accountId && <p className="text-sm text-destructive">{errors.accountId.message}</p>}
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
