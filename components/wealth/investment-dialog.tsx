'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { investmentSchema, type InvestmentInput, INVESTMENT_TYPES } from '@/lib/validations/wealth';
import { todayISO } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { FamilyMember, Investment } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: Investment | null;
}

export function InvestmentDialog({ open, onOpenChange, onSaved, editing }: Props) {
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
  } = useForm<InvestmentInput>({
    resolver: zodResolver(investmentSchema),
    defaultValues: { type: 'other', startedOn: todayISO() },
  });

  useEffect(() => {
    if (!open || !currentFamily) return;
    const supabase = createClient();
    supabase
      .from('family_members')
      .select('*')
      .eq('family_id', currentFamily.id)
      .eq('status', 'active')
      .then(({ data }) => setMembers((data as FamilyMember[]) ?? []));

    reset(
      editing
        ? {
            name: editing.name,
            type: editing.type,
            initialAmount: editing.initial_amount,
            currentValue: editing.current_value,
            startedOn: editing.started_on,
            ownerMemberId: editing.owner_member_id,
            notes: editing.notes ?? '',
          }
        : { type: 'other', startedOn: todayISO() }
    );
  }, [open, currentFamily, editing, reset]);

  const onSubmit = async (data: InvestmentInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      name: data.name,
      type: data.type,
      initial_amount: data.initialAmount,
      current_value: data.currentValue,
      started_on: data.startedOn,
      owner_member_id: data.ownerMemberId || null,
      notes: data.notes || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('investments').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('investments').insert({ ...payload, family_id: currentFamily.id, created_by: user!.id }));
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
          <DialogTitle>{editing ? 'Edit Investment' : 'Add Investment'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="DBBL DPS, Beximco shares…" {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INVESTMENT_TYPES.map((t) => (
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
              <Label htmlFor="initialAmount">Invested (৳)</Label>
              <Input id="initialAmount" type="number" step="0.01" {...register('initialAmount')} />
              {errors.initialAmount && <p className="text-sm text-destructive">{errors.initialAmount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentValue">Current value (৳)</Label>
              <Input id="currentValue" type="number" step="0.01" {...register('currentValue')} />
              {errors.currentValue && <p className="text-sm text-destructive">{errors.currentValue.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startedOn">Start date</Label>
              <Input id="startedOn" type="date" {...register('startedOn')} />
            </div>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Update' : 'Add investment'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
