'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { expenseSchema, type ExpenseInput } from '@/lib/validations/finance';
import { todayISO } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel,
} from '@/components/ui/select';
import type { Account, Category, FamilyMember, ExpenseEntry, FamilyEvent } from '@/types/database';

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: ExpenseEntry | null;
}

export function ExpenseFormDialog({ open, onOpenChange, onSaved, editing }: Props) {
  const { currentFamily } = useFamily();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { occurredOn: todayISO(), scope: 'family' },
  });

  // Expense categories are all leaf rows (each has a parent_key group). Show
  // them flat but visually grouped by their parent; store the leaf key.
  const groups = categories.reduce<Record<string, Category[]>>((acc, c) => {
    const g = c.parent_key || 'other';
    (acc[g] ??= []).push(c);
    return acc;
  }, {});

  useEffect(() => {
    if (!open || !currentFamily) return;
    const supabase = createClient();

    supabase.from('accounts').select('*').eq('family_id', currentFamily.id).eq('is_archived', false)
      .then(({ data }) => setAccounts((data as Account[]) ?? []));
    supabase.from('categories').select('*').eq('type', 'expense')
      .then(({ data }) => setCategories((data as Category[]) ?? []));
    supabase.from('family_members').select('*').eq('family_id', currentFamily.id).eq('status', 'active')
      .then(({ data }) => setMembers((data as FamilyMember[]) ?? []));
    supabase.from('family_events').select('*').eq('family_id', currentFamily.id).eq('is_active', true)
      .then(({ data }) => setEvents((data as FamilyEvent[]) ?? []), () => setEvents([]));

    reset(
      editing
        ? {
            amount: editing.amount,
            occurredOn: editing.occurred_on,
            categoryKey: editing.category_key,
            subcategoryKey: editing.subcategory_key ?? undefined,
            personId: editing.person_id,
            accountId: editing.account_id,
            merchant: editing.merchant ?? '',
            notes: editing.notes ?? '',
            scope: editing.scope,
            eventId: (editing as ExpenseEntry & { event_id?: string | null }).event_id ?? null,
          }
        : { occurredOn: todayISO(), scope: 'family' }
    );
  }, [open, currentFamily, editing, reset]);

  const onSubmit = async (data: ExpenseInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload: Record<string, unknown> = {
      family_id: currentFamily.id,
      account_id: data.accountId,
      person_id: data.personId || null,
      category_key: data.categoryKey,
      subcategory_key: null,
      amount: data.amount,
      occurred_on: data.occurredOn,
      merchant: data.merchant || null,
      notes: data.notes || null,
      scope: data.scope,
    };
    // only send event_id once the Milestone 3 column exists / a value is set
    if (data.eventId) payload.event_id = data.eventId;

    const { error } = editing
      ? await supabase.from('expenses').update(payload).eq('id', editing.id)
      : await supabase.from('expenses').insert({ ...payload, created_by: user!.id });

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
          <DialogTitle>{editing ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
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
                  <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(groups).map(([group, items]) => (
                      <SelectGroup key={group}>
                        <SelectLabel>{titleCase(group)}</SelectLabel>
                        {items.map((c) => (
                          <SelectItem key={c.id} value={c.key}>{c.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.categoryKey && <p className="text-sm text-destructive">{errors.categoryKey.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account / payment method</Label>
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
            <Label>Scope</Label>
            <Controller
              control={control}
              name="scope"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="family">Family</SelectItem>
                    <SelectItem value="shared">Shared</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="merchant">Merchant</Label>
              <Input id="merchant" placeholder="e.g. Shwapno" {...register('merchant')} />
            </div>
            <div className="space-y-2">
              <Label>Family event</Label>
              <Controller
                control={control}
                name="eventId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value ?? undefined} disabled={!events.length}>
                    <SelectTrigger><SelectValue placeholder={events.length ? 'Optional' : 'No events'} /></SelectTrigger>
                    <SelectContent>
                      {events.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
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
            {isSubmitting ? 'Saving…' : editing ? 'Update expense' : 'Add expense'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
