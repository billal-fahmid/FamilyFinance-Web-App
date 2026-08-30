'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { formatBDT } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ExpenseSplit, FamilyMember } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  expense: { id: string; amount: number; merchant: string | null; category_key: string } | null;
}

export function SplitDialog({ open, onOpenChange, onSaved, expense }: Props) {
  const { currentFamily } = useFamily();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [shares, setShares] = useState<Record<string, string>>({});
  const [existing, setExisting] = useState<ExpenseSplit[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !currentFamily || !expense) return;
    const supabase = createClient();
    (async () => {
      const [{ data: mem }, { data: sp }] = await Promise.all([
        supabase.from('family_members').select('*').eq('family_id', currentFamily.id).eq('status', 'active'),
        supabase.from('expense_splits').select('*').eq('expense_id', expense.id),
      ]);
      const m = (mem as FamilyMember[]) ?? [];
      setMembers(m);
      const spl = (sp as ExpenseSplit[]) ?? [];
      setExisting(spl);
      if (spl.length) {
        setShares(Object.fromEntries(spl.map((s) => [s.member_id ?? '', String(s.share_amount)])));
      } else {
        // default: equal split among all members
        const each = (Number(expense.amount) / Math.max(m.length, 1)).toFixed(2);
        setShares(Object.fromEntries(m.map((mm) => [mm.id, each])));
      }
    })();
  }, [open, currentFamily, expense]);

  const splitEqual = () => {
    const each = (Number(expense?.amount ?? 0) / Math.max(members.length, 1)).toFixed(2);
    setShares(Object.fromEntries(members.map((m) => [m.id, each])));
  };

  const total = Object.values(shares).reduce((s, v) => s + (Number(v) || 0), 0);
  const diff = Number(expense?.amount ?? 0) - total;

  const save = async () => {
    if (!currentFamily || !expense) return;
    setError(null);
    setIsSubmitting(true);
    const supabase = createClient();

    await supabase.from('expense_splits').delete().eq('expense_id', expense.id);
    const rows = members
      .filter((m) => Number(shares[m.id]) > 0)
      .map((m) => {
        const prev = existing.find((e) => e.member_id === m.id);
        return {
          family_id: currentFamily.id,
          expense_id: expense.id,
          member_id: m.id,
          member_label: m.display_name,
          share_amount: Number(shares[m.id]),
          is_settled: prev?.is_settled ?? false,
          settled_on: prev?.settled_on ?? null,
        };
      });

    if (rows.length) {
      const { error: e } = await supabase.from('expense_splits').insert(rows);
      if (e) {
        setIsSubmitting(false);
        return setError(e.message);
      }
    }
    // mark expense scope shared for visibility
    await supabase.from('expenses').update({ scope: 'shared' }).eq('id', expense.id);

    setIsSubmitting(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split {expense?.merchant || expense?.category_key}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md bg-muted p-3 text-sm">
            <span>Total expense</span>
            <span className="font-semibold tabular-nums">{formatBDT(expense?.amount ?? 0)}</span>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={splitEqual}>Split equally</Button>
          </div>

          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <Label className="flex-1">{m.display_name}</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="w-32"
                  value={shares[m.id] ?? ''}
                  onChange={(e) => setShares((s) => ({ ...s, [m.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div
            className={
              'flex items-center justify-between rounded-md p-3 text-sm ' +
              (Math.abs(diff) < 0.01 ? 'bg-income/10 text-income' : 'bg-amber-500/10 text-amber-600')
            }
          >
            <span>{Math.abs(diff) < 0.01 ? 'Splits add up' : 'Difference'}</span>
            <span className="font-medium tabular-nums">{formatBDT(diff)}</span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" onClick={save} disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save split'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
