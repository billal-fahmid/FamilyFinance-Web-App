'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { incomeSchema, type IncomeInput } from '@/lib/validations/finance';
import { todayISO } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Account, Category, FamilyMember, IncomeEntry } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: IncomeEntry | null;
}

export function IncomeFormDialog({ open, onOpenChange, onSaved, editing }: Props) {
  const { currentFamily } = useFamily();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<IncomeInput>({
    resolver: zodResolver(incomeSchema),
    defaultValues: { occurredOn: todayISO(), isRecurring: false },
  });

  useEffect(() => {
    if (!open || !currentFamily) return;
    const supabase = createClient();

    supabase.from('accounts').select('*').eq('family_id', currentFamily.id).eq('is_archived', false)
      .then(({ data }) => setAccounts((data as Account[]) ?? []));
    supabase.from('categories').select('*').eq('type', 'income')
      .then(({ data }) => setCategories((data as Category[]) ?? []));
    supabase.from('family_members').select('*').eq('family_id', currentFamily.id).eq('status', 'active')
      .then(({ data }) => setMembers((data as FamilyMember[]) ?? []));

    reset(
      editing
        ? {
            amount: editing.amount,
            occurredOn: editing.occurred_on,
            source: editing.source ?? '',
            categoryKey: editing.category_key,
            personId: editing.person_id,
            accountId: editing.account_id,
            isRecurring: editing.is_recurring,
            frequency: editing.frequency,
            notes: editing.notes ?? '',
          }
        : { occurredOn: todayISO(), isRecurring: false }
    );
  }, [open, currentFamily, editing, reset]);

  const onSubmit = async (data: IncomeInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      family_id: currentFamily.id,
      account_id: data.accountId,
      person_id: data.personId || null,
      category_key: data.categoryKey,
      amount: data.amount,
      occurred_on: data.occurredOn,
      source: data.source || null,
      notes: data.notes || null,
      is_recurring: data.isRecurring,
      frequency: data.isRecurring ? data.frequency : null,
    };

    const { error } = editing
      ? await supabase.from('income').update(payload).eq('id', editing.id)
      : await supabase.from('income').insert({ ...payload, created_by: user!.id });

    setIsSubmitting(false);
    if (error) {
      setServerError(error.message);
      return;
    }

    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Income' : 'Add Income'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
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
            <Label>Category</Label>
            <Controller
              control={control}
              name="categoryKey"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.categoryKey && <p className="text-sm text-destructive">{errors.categoryKey.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account</Label>
              <Controller
                control={control}
                name="accountId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.accountId && <p className="text-sm text-destructive">{errors.accountId.message}</p>}
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
            <Label htmlFor="source">Source</Label>
            <Input id="source" placeholder="e.g. Employer name" {...register('source')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Update income' : 'Add income'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
