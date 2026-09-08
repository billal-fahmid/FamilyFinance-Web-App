'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { budgetSchema, type BudgetInput } from '@/lib/validations/budget';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { Budget, BudgetCategory, Category } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: (Budget & { budget_categories: BudgetCategory[] }) | null;
  defaultMonth: string;
}

// A one-click starting point for the most common monthly household costs.
const COMMON_MONTHLY_KEYS = ['rent', 'grocery', 'electricity', 'gas', 'water', 'internet', 'mobile'];

export function BudgetFormDialog({ open, onOpenChange, onSaved, editing, defaultMonth }: Props) {
  const { currentFamily } = useFamily();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors },
  } = useForm<BudgetInput>({
    resolver: zodResolver(budgetSchema),
    defaultValues: { month: defaultMonth, categories: [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'categories' });

  const addCommonCategories = () => {
    const current = getValues('categories') ?? [];
    const existingKeys = new Set(current.map((c) => c.categoryKey).filter(Boolean));
    const toAdd = COMMON_MONTHLY_KEYS.filter(
      (key) => categories.some((c) => c.key === key) && !existingKeys.has(key)
    );
    if (toAdd.length === 0) return;
    if (current.length === 1 && !current[0].categoryKey) remove(0);
    toAdd.forEach((key) => append({ categoryKey: key, limitAmount: 0 }));
  };

  useEffect(() => {
    if (!open || !currentFamily) return;
    const supabase = createClient();
    supabase
      .from('categories')
      .select('*')
      .eq('type', 'expense')
      .then(({ data }) => setCategories((data as Category[]) ?? []));

    reset(
      editing
        ? {
            month: editing.month.slice(0, 7),
            totalLimit: editing.total_limit ?? undefined,
            notes: editing.notes ?? '',
            categories: (editing.budget_categories ?? []).map((bc) => ({
              categoryKey: bc.category_key,
              limitAmount: bc.limit_amount,
            })),
          }
        : { month: defaultMonth.slice(0, 7), categories: [{ categoryKey: '', limitAmount: 0 }] }
    );
  }, [open, currentFamily, editing, defaultMonth, reset]);

  const onSubmit = async (data: BudgetInput) => {
    if (!currentFamily) return;
    setServerError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // data.month comes from a native <input type="month"> as "YYYY-MM"
    const month = `${data.month}-01`;

    // upsert the budget for this family+month
    const { data: budget, error } = await supabase
      .from('budgets')
      .upsert(
        {
          family_id: currentFamily.id,
          month,
          total_limit: data.totalLimit ?? null,
          notes: data.notes || null,
          created_by: user!.id,
        },
        { onConflict: 'family_id,month' }
      )
      .select()
      .single();

    if (error || !budget) {
      setIsSubmitting(false);
      return setServerError(error?.message ?? 'Could not save budget');
    }

    // replace category rows
    await supabase.from('budget_categories').delete().eq('budget_id', budget.id);
    const rows = data.categories
      .filter((c) => c.categoryKey)
      .map((c) => ({ budget_id: budget.id, category_key: c.categoryKey, limit_amount: c.limitAmount }));
    if (rows.length) {
      const { error: catError } = await supabase.from('budget_categories').insert(rows);
      if (catError) {
        setIsSubmitting(false);
        return setServerError(catError.message);
      }
    }

    setIsSubmitting(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Budget' : 'Create Monthly Budget'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="month">Month</Label>
              <Input id="month" type="month" {...register('month')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="totalLimit">Overall limit (৳)</Label>
              <Input id="totalLimit" type="number" step="0.01" placeholder="Optional" {...register('totalLimit')} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Category budgets</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addCommonCategories}>
                  Common monthly costs
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ categoryKey: '', limitAmount: 0 })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              &quot;Common monthly costs&quot; fills in Rent, Grocery, Electricity, Gas, Water, Internet and Mobile — just set the limits.
            </p>
            {fields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <Controller
                  control={control}
                  name={`categories.${i}.categoryKey`}
                  render={({ field: f }) => (
                    <Select onValueChange={f.onChange} value={f.value || undefined}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.key}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Limit"
                  className="w-32"
                  {...register(`categories.${i}.limitAmount`)}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {errors.categories && <p className="text-sm text-destructive">Check the category rows.</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save budget'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
