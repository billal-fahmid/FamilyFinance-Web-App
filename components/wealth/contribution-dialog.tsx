'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { savingsContributionSchema, type SavingsContributionInput } from '@/lib/validations/wealth';
import { todayISO, formatBDT } from '@/lib/utils';
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
  goal: SavingsGoal | null;
}

export function ContributionDialog({ open, onOpenChange, onSaved, goal }: Props) {
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
  } = useForm<SavingsContributionInput>({
    resolver: zodResolver(savingsContributionSchema),
    defaultValues: { contributedOn: todayISO() },
  });

  useEffect(() => {
    if (!open || !currentFamily || !goal) return;
    const supabase = createClient();
    supabase
      .from('accounts')
      .select('*')
      .eq('family_id', currentFamily.id)
      .eq('is_archived', false)
      .then(({ data }) => setAccounts((data as Account[]) ?? []));
    reset({ goalId: goal.id, accountId: goal.account_id, contributedOn: todayISO() });
  }, [open, currentFamily, goal, reset]);

  const onSubmit = async (data: SavingsContributionInput) => {
    if (!currentFamily || !goal) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('savings_contributions').insert({
      family_id: currentFamily.id,
      goal_id: goal.id,
      account_id: data.accountId || null,
      amount: data.amount,
      contributed_on: data.contributedOn,
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
          <DialogTitle>Add to {goal?.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {goal && (
            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              {formatBDT(goal.current_amount)} of {formatBDT(goal.target_amount)} saved. Contributions
              track progress toward the goal; they don&apos;t move money between accounts.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (৳)</Label>
              <Input id="amount" type="number" step="0.01" {...register('amount')} />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contributedOn">Date</Label>
              <Input id="contributedOn" type="date" {...register('contributedOn')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>From account (optional)</Label>
            <Controller
              control={control}
              name="accountId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                  <SelectTrigger><SelectValue placeholder="Reference only" /></SelectTrigger>
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
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Adding…' : 'Add contribution'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
