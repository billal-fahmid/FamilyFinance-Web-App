'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { billSchema, type BillInput, BILL_CATEGORIES } from '@/lib/validations/bills';
import { todayISO } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Account, Bill } from '@/types/database';

const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: Bill | null;
}

export function BillFormDialog({ open, onOpenChange, onSaved, editing }: Props) {
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
  } = useForm<BillInput>({
    resolver: zodResolver(billSchema),
    defaultValues: { frequency: 'monthly', reminderDaysBefore: 3, isActive: true, categoryKey: 'other', nextDueDate: todayISO() },
  });

  useEffect(() => {
    if (!open || !currentFamily) return;
    const supabase = createClient();
    supabase
      .from('accounts')
      .select('*')
      .eq('family_id', currentFamily.id)
      .eq('is_archived', false)
      .then(({ data }) => setAccounts((data as Account[]) ?? []));

    reset(
      editing
        ? {
            name: editing.name,
            amount: editing.amount,
            categoryKey: editing.category_key,
            frequency: editing.frequency,
            nextDueDate: editing.next_due_date,
            paymentAccountId: editing.payment_account_id,
            reminderDaysBefore: editing.reminder_days_before,
            isActive: editing.is_active,
            notes: editing.notes ?? '',
          }
        : { frequency: 'monthly', reminderDaysBefore: 3, isActive: true, categoryKey: 'other', nextDueDate: todayISO() }
    );
  }, [open, currentFamily, editing, reset]);

  const onSubmit = async (data: BillInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      name: data.name,
      amount: data.amount,
      category_key: data.categoryKey,
      frequency: data.frequency,
      next_due_date: data.nextDueDate,
      payment_account_id: data.paymentAccountId || null,
      reminder_days_before: data.reminderDaysBefore,
      is_active: data.isActive,
      notes: data.notes || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('bills').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('bills').insert({ ...payload, family_id: currentFamily.id, created_by: user!.id }));
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
          <DialogTitle>{editing ? 'Edit Bill' : 'Add Bill'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="House rent, DESCO electricity…" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (৳)</Label>
              <Input id="amount" type="number" step="0.01" {...register('amount')} />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Controller
                control={control}
                name="categoryKey"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BILL_CATEGORIES.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Controller
                control={control}
                name="frequency"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nextDueDate">Next due date</Label>
              <Input id="nextDueDate" type="date" {...register('nextDueDate')} />
              {errors.nextDueDate && <p className="text-sm text-destructive">{errors.nextDueDate.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Payment account</Label>
              <Controller
                control={control}
                name="paymentAccountId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminderDaysBefore">Remind days before</Label>
              <Input id="reminderDaysBefore" type="number" min={0} max={60} {...register('reminderDaysBefore')} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} /> Active (show reminders)
          </label>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Update bill' : 'Add bill'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
