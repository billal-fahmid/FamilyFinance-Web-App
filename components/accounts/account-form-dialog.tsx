'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { accountSchema, type AccountInput } from '@/lib/validations/finance';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Account, FamilyMember } from '@/types/database';

const ACCOUNT_TYPES: { value: Account['type']; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank Account' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'savings', label: 'Savings Account' },
  { value: 'other', label: 'Other' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: Account | null;
}

export function AccountFormDialog({ open, onOpenChange, onSaved, editing }: Props) {
  const { currentFamily } = useFamily();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AccountInput>({ resolver: zodResolver(accountSchema), defaultValues: { openingBalance: 0 } });

  useEffect(() => {
    if (!open || !currentFamily) return;
    const supabase = createClient();
    supabase.from('family_members').select('*').eq('family_id', currentFamily.id).eq('status', 'active')
      .then(({ data }) => setMembers((data as FamilyMember[]) ?? []));

    reset(
      editing
        ? {
            name: editing.name,
            type: editing.type,
            openingBalance: editing.opening_balance,
            ownerMemberId: editing.owner_member_id,
            maskedNumber: editing.masked_number ?? '',
            notes: editing.notes ?? '',
          }
        : { openingBalance: 0 }
    );
  }, [open, currentFamily, editing, reset]);

  const onSubmit = async (data: AccountInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();

    if (editing) {
      const { error } = await supabase
        .from('accounts')
        .update({
          name: data.name,
          type: data.type,
          owner_member_id: data.ownerMemberId || null,
          masked_number: data.maskedNumber || null,
          notes: data.notes || null,
        })
        .eq('id', editing.id);
      setIsSubmitting(false);
      if (error) return setServerError(error.message);
    } else {
      const { error } = await supabase.from('accounts').insert({
        family_id: currentFamily.id,
        name: data.name,
        type: data.type,
        opening_balance: data.openingBalance,
        current_balance: data.openingBalance,
        owner_member_id: data.ownerMemberId || null,
        masked_number: data.maskedNumber || null,
        notes: data.notes || null,
      });
      setIsSubmitting(false);
      if (error) return setServerError(error.message);
    }

    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Account' : 'Add Account'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Account name</Label>
            <Input id="name" placeholder="e.g. Family Cash, Dutch-Bangla" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Account type</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
          </div>

          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="openingBalance">Opening balance (৳)</Label>
              <Input id="openingBalance" type="number" step="0.01" {...register('openingBalance')} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Owner</Label>
            <Controller
              control={control}
              name="ownerMemberId"
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

          <div className="space-y-2">
            <Label htmlFor="maskedNumber">Masked account number</Label>
            <Input id="maskedNumber" placeholder="**** 4821" {...register('maskedNumber')} />
            <p className="text-xs text-muted-foreground">Never store the full account number — last 4 digits only.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Update account' : 'Add account'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
