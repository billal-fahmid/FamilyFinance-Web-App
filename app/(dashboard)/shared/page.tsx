'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Split, Check, Undo2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SplitDialog } from '@/components/shared/split-dialog';
import { formatBDT, formatDate, todayISO } from '@/lib/utils';
import type { ExpenseEntry, ExpenseSplit, FamilyMember } from '@/types/database';

type ExpWithSplits = ExpenseEntry & { expense_splits: ExpenseSplit[] };

export default function SharedExpensesPage() {
  const { currentFamily } = useFamily();
  const [expenses, setExpenses] = useState<ExpWithSplits[]>([]);
  const [members, setMembers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState<ExpWithSplits | null>(null);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const [{ data: exp }, { data: mem }] = await Promise.all([
      supabase
        .from('expenses')
        .select('*, expense_splits(*)')
        .eq('family_id', currentFamily.id)
        .in('scope', ['shared', 'family'])
        .order('occurred_on', { ascending: false })
        .limit(100),
      supabase.from('family_members').select('id, display_name').eq('family_id', currentFamily.id),
    ]);
    setExpenses(((exp as ExpWithSplits[]) ?? []).filter((e) => e.expense_splits.length > 0 || e.scope === 'shared'));
    setMembers(Object.fromEntries(((mem as FamilyMember[]) ?? []).map((m) => [m.id, m.display_name])));
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSettled = async (split: ExpenseSplit) => {
    const supabase = createClient();
    await supabase
      .from('expense_splits')
      .update({ is_settled: !split.is_settled, settled_on: !split.is_settled ? todayISO() : null })
      .eq('id', split.id);
    load();
  };

  const owed = useMemo(() => {
    const byMember: Record<string, { total: number; settled: number }> = {};
    for (const e of expenses) {
      for (const s of e.expense_splits) {
        const key = s.member_id ?? s.member_label ?? 'unknown';
        byMember[key] ??= { total: 0, settled: 0 };
        byMember[key].total += Number(s.share_amount);
        if (s.is_settled) byMember[key].settled += Number(s.share_amount);
      }
    }
    return byMember;
  }, [expenses]);

  const totalOutstanding = Object.values(owed).reduce((s, m) => s + (m.total - m.settled), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Shared Expenses</h1>
        <p className="text-sm text-muted-foreground">Split bills and track who has settled up</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Split Expenses" value={String(expenses.length)} />
            <StatTile label="Outstanding" value={formatBDT(totalOutstanding)} tone={totalOutstanding > 0 ? 'expense' : 'income'} />
            <StatTile label="People" value={String(Object.keys(owed).length)} />
          </div>

          {Object.keys(owed).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-foreground">Balances</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(owed).map(([key, v]) => (
                  <div key={key} className="flex justify-between">
                    <span>{members[key] ?? key}</span>
                    <span className="tabular-nums">
                      {formatBDT(v.settled)} settled ·{' '}
                      <span className={v.total - v.settled > 0 ? 'font-medium text-destructive' : 'text-income'}>
                        {formatBDT(v.total - v.settled)} owed
                      </span>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <p className="text-sm text-muted-foreground">
            To split an expense, open it from{' '}
            <a href="/transactions" className="text-primary hover:underline">Transactions</a> or split one below.
          </p>

          <div className="space-y-3">
            {expenses.length === 0 && (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No shared expenses yet. Mark an expense as “Shared” and split it among members.
              </p>
            )}
            {expenses.map((e) => (
              <Card key={e.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{e.merchant || e.category_key}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(e.occurred_on)} · {formatBDT(e.amount)}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { setTarget(e); setDialogOpen(true); }}>
                      <Split className="mr-1 h-3.5 w-3.5" /> {e.expense_splits.length ? 'Edit split' : 'Split'}
                    </Button>
                  </div>
                  {e.expense_splits.length > 0 && (
                    <div className="mt-3 divide-y rounded-md border">
                      {e.expense_splits.map((s) => (
                        <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span>{s.member_id ? members[s.member_id] ?? s.member_label : s.member_label}</span>
                          <div className="flex items-center gap-3">
                            <span className="tabular-nums">{formatBDT(s.share_amount)}</span>
                            <button
                              onClick={() => toggleSettled(s)}
                              className={
                                'flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ' +
                                (s.is_settled
                                  ? 'bg-income/15 text-income'
                                  : 'bg-muted text-muted-foreground hover:bg-accent')
                              }
                            >
                              {s.is_settled ? <><Check className="h-3 w-3" /> Settled</> : <><Undo2 className="h-3 w-3" /> Mark settled</>}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <SplitDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={load} expense={target} />
    </div>
  );
}
