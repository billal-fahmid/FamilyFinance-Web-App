'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { savingsGoalSchema, type SavingsGoalInput, SAVINGS_GOAL_TYPES } from '@/lib/validations/wealth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Account, SavingsGoal } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: SavingsGoal | null;
}

export function SavingsGoalDialog({ open, onOpenChange, onSaved, editing }: Props) {
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
  } = useForm<SavingsGoalInput>({
    resolver: zodResolver(savingsGoalSchema),
    defaultValues: { goalType: 'custom', currentAmount: 0 },
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
            goalType: editing.goal_type,
            targetAmount: editing.target_amount,
            currentAmount: editing.current_amount,
            targetDate: editing.target_date,
            accountId: editing.account_id,
            notes: editing.notes ?? '',
          }
        : { goalType: 'custom', currentAmount: 0 }
    );
  }, [open, currentFamily, editing, reset]);

  const onSubmit = async (data: SavingsGoalInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      name: data.name,
      goal_type: data.goalType,
      target_amount: data.targetAmount,
      target_date: data.targetDate || null,
      account_id: data.accountId || null,
      notes: data.notes || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('savings_goals').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('savings_goals').insert({
        ...payload,
        family_id: currentFamily.id,
        current_amount: data.currentAmount ?? 0,
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
          <DialogTitle>{editing ? 'Edit Savings Goal' : 'New Savings Goal'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Goal name</Label>
              <Input id="name" placeholder="Emergency Fund" {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Controller
                control={control}
                name="goalType"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SAVINGS_GOAL_TYPES.map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="targetAmount">Target amount (৳)</Label>
              <Input id="targetAmount" type="number" step="0.01" {...register('targetAmount')} />
              {errors.targetAmount && <p className="text-sm text-destructive">{errors.targetAmount.message}</p>}
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="currentAmount">Starting amount (৳)</Label>
                <Input id="currentAmount" type="number" step="0.01" {...register('currentAmount')} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="targetDate">Target date</Label>
              <Input id="targetDate" type="date" {...register('targetDate')} />
            </div>
            <div className="space-y-2">
              <Label>Linked account</Label>
              <Controller
                control={control}
                name="accountId"
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Update goal' : 'Create goal'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
