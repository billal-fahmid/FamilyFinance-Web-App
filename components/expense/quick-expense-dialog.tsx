'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { quickExpenseSchema, type QuickExpenseInput } from '@/lib/validations/finance';
import { todayISO, newId, formatBDT, formatDate } from '@/lib/utils';
import { friendlyError } from '@/lib/errors';
import { findSimilarTransaction, type SimilarHit } from '@/lib/duplicate-check';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { CategoryCombobox } from '@/components/category-combobox';
import type { Account, Category } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function QuickExpenseDialog({ open, onOpenChange, onSaved }: Props) {
  const { currentFamily } = useFamily();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<SimilarHit[] | null>(null);
  const [pending, setPending] = useState<QuickExpenseInput | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<QuickExpenseInput>({
    resolver: zodResolver(quickExpenseSchema),
    defaultValues: { occurredOn: todayISO() },
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

    supabase
      .from('categories')
      .select('*')
      .eq('type', 'expense')
      .or(`family_id.is.null,family_id.eq.${currentFamily.id}`)
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  }, [open, currentFamily]);

  const doInsert = async (data: QuickExpenseInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('expenses').insert({
      id: newId(),
      family_id: currentFamily.id,
      account_id: data.accountId,
      category_key: data.categoryKey,
      amount: data.amount,
      occurred_on: data.occurredOn,
      created_by: user!.id,
      scope: 'family',
    });

    setIsSubmitting(false);
    if (error) return setServerError(friendlyError(error));

    reset({ occurredOn: todayISO(), amount: undefined, categoryKey: '', accountId: '' } as any);
    setDupes(null);
    setPending(null);
    onOpenChange(false);
    onSaved?.();
  };

  const onSubmit = async (data: QuickExpenseInput) => {
    if (!currentFamily) return;
    setServerError(null);
    const similar = await findSimilarTransaction({
      familyId: currentFamily.id,
      table: 'expenses',
      amount: data.amount,
      occurredOn: data.occurredOn,
      categoryKey: data.categoryKey,
    });
    if (similar.length > 0) {
      setDupes(similar);
      setPending(data);
      return;
    }
    await doInsert(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick Expense</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (৳)</Label>
            <Input id="amount" type="number" step="0.01" autoFocus placeholder="250" {...register('amount')} />
            {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Controller
              control={control}
              name="categoryKey"
              render={({ field }) => (
                <CategoryCombobox
                  categories={categories}
                  value={field.value}
                  onChange={field.onChange}
                  onCategoryCreated={(c) => setCategories((prev) => [...prev, c])}
                  familyId={currentFamily?.id ?? ''}
                  type="expense"
                  placeholder="Select or type a category"
                />
              )}
            />
            {errors.categoryKey && <p className="text-sm text-destructive">{errors.categoryKey.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Account</Label>
            <Controller
              control={control}
              name="accountId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.accountId && <p className="text-sm text-destructive">{errors.accountId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="occurredOn">Date</Label>
            <Input id="occurredOn" type="date" {...register('occurredOn')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          {dupes && dupes.length > 0 ? (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-700">
                This looks similar to an existing transaction. Add it anyway?
              </p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {dupes.map((d) => (
                  <li key={d.id}>
                    {formatBDT(d.amount)} · {formatDate(d.occurred_on)}
                    {d.merchant ? ` · ${d.merchant}` : d.source ? ` · ${d.source}` : ''}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  disabled={isSubmitting}
                  onClick={() => pending && doInsert(pending)}
                >
                  Add anyway
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setDupes(null); setPending(null); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save expense'}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
