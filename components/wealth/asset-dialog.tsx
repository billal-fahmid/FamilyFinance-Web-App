'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { assetSchema, type AssetInput, ASSET_TYPES } from '@/lib/validations/wealth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Asset, FamilyMember } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: Asset | null;
}

export function AssetDialog({ open, onOpenChange, onSaved, editing }: Props) {
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
  } = useForm<AssetInput>({ resolver: zodResolver(assetSchema), defaultValues: { assetType: 'other' } });

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
            assetType: editing.asset_type,
            purchaseValue: editing.purchase_value,
            currentValue: editing.current_value,
            purchaseDate: editing.purchase_date,
            ownerMemberId: editing.owner_member_id,
            notes: editing.notes ?? '',
          }
        : { assetType: 'other' }
    );
  }, [open, currentFamily, editing, reset]);

  const onSubmit = async (data: AssetInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      name: data.name,
      asset_type: data.assetType,
      purchase_value: data.purchaseValue,
      current_value: data.currentValue,
      purchase_date: data.purchaseDate || null,
      owner_member_id: data.ownerMemberId || null,
      notes: data.notes || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('assets').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('assets').insert({ ...payload, family_id: currentFamily.id, created_by: user!.id }));
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
          <DialogTitle>{editing ? 'Edit Asset' : 'Add Asset'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Dhanmondi flat, Toyota Axio…" {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Controller
                control={control}
                name="assetType"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ASSET_TYPES.map((t) => (
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
              <Label htmlFor="purchaseValue">Purchase value (৳)</Label>
              <Input id="purchaseValue" type="number" step="0.01" {...register('purchaseValue')} />
              {errors.purchaseValue && <p className="text-sm text-destructive">{errors.purchaseValue.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentValue">Current est. value (৳)</Label>
              <Input id="currentValue" type="number" step="0.01" {...register('currentValue')} />
              {errors.currentValue && <p className="text-sm text-destructive">{errors.currentValue.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="purchaseDate">Purchase date</Label>
              <Input id="purchaseDate" type="date" {...register('purchaseDate')} />
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
            {isSubmitting ? 'Saving…' : editing ? 'Update' : 'Add asset'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
