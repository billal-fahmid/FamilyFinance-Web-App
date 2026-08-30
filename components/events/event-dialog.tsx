'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { familyEventSchema, type FamilyEventInput, FAMILY_EVENT_TYPES } from '@/lib/validations/wealth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { FamilyEvent } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: FamilyEvent | null;
}

export function EventDialog({ open, onOpenChange, onSaved, editing }: Props) {
  const { currentFamily } = useFamily();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FamilyEventInput>({
    resolver: zodResolver(familyEventSchema),
    defaultValues: { eventType: 'other', budgetAmount: 0 },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      editing
        ? {
            name: editing.name,
            eventType: editing.event_type,
            budgetAmount: editing.budget_amount,
            eventDate: editing.event_date,
            notes: editing.notes ?? '',
          }
        : { eventType: 'other', budgetAmount: 0 }
    );
  }, [open, editing, reset]);

  const onSubmit = async (data: FamilyEventInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      name: data.name,
      event_type: data.eventType,
      budget_amount: data.budgetAmount,
      event_date: data.eventDate || null,
      notes: data.notes || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('family_events').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('family_events').insert({ ...payload, family_id: currentFamily.id, created_by: user!.id }));
    }

    setIsSubmitting(false);
    if (error) return setServerError(error.message);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Event' : 'New Family Event'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Event name</Label>
              <Input id="name" placeholder="Eid ul-Fitr 2026" {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Controller
                control={control}
                name="eventType"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FAMILY_EVENT_TYPES.map((t) => (
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
              <Label htmlFor="budgetAmount">Budget (৳)</Label>
              <Input id="budgetAmount" type="number" step="0.01" {...register('budgetAmount')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventDate">Event date</Label>
              <Input id="eventDate" type="date" {...register('eventDate')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          <p className="text-xs text-muted-foreground">
            Tag expenses with this event (in the expense form) and they count toward its budget.
          </p>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Update event' : 'Create event'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
