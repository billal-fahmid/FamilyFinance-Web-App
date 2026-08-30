'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BudgetFormDialog } from '@/components/budget/budget-form-dialog';
import { formatBDT } from '@/lib/utils';
import { monthStartISO } from '@/lib/finance';
import type { Budget, BudgetCategory, Category } from '@/types/database';

type BudgetWithCats = Budget & { budget_categories: BudgetCategory[] };

function alertLabel(pct: number): { text: string; tone: 'ok' | 'warn' | 'danger' } {
  if (pct >= 100) return { text: 'Exceeded', tone: 'danger' };
  if (pct >= 90) return { text: '90% used', tone: 'danger' };
  if (pct >= 80) return { text: '80% used', tone: 'warn' };
  return { text: 'On track', tone: 'ok' };
}

export default function BudgetPage() {
  const { currentFamily } = useFamily();
  const [monthOffset, setMonthOffset] = useState(0);
  const [budget, setBudget] = useState<BudgetWithCats | null>(null);
  const [spentByCat, setSpentByCat] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const month = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return monthStartISO(d);
  }, [monthOffset]);

  const monthLabel = useMemo(
    () => new Date(month + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [month]
  );

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const nextMonth = new Date(month + 'T00:00:00');
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthISO = nextMonth.toISOString().slice(0, 10);

    const [{ data: b }, { data: spend }, { data: cats }] = await Promise.all([
      supabase
        .from('budgets')
        .select('*, budget_categories(*)')
        .eq('family_id', currentFamily.id)
        .eq('month', month)
        .maybeSingle(),
      supabase
        .from('v_unified_spend')
        .select('category_key, amount')
        .eq('family_id', currentFamily.id)
        .gte('occurred_on', month)
        .lt('occurred_on', nextMonthISO),
      supabase.from('categories').select('*').eq('type', 'expense'),
    ]);

    setBudget((b as BudgetWithCats) ?? null);
    const totals: Record<string, number> = {};
    ((spend as any[]) ?? []).forEach((r) => {
      totals[r.category_key] = (totals[r.category_key] ?? 0) + Number(r.amount);
    });
    setSpentByCat(totals);
    setCategories((cats as Category[]) ?? []);
    setLoading(false);
  }, [currentFamily, month]);

  useEffect(() => {
    load();
  }, [load]);

  const labelFor = (key: string) => categories.find((c) => c.key === key)?.label ?? key;

  const rows = (budget?.budget_categories ?? []).map((bc) => {
    const spent = spentByCat[bc.category_key] ?? 0;
    const pct = bc.limit_amount > 0 ? (spent / bc.limit_amount) * 100 : 0;
    return { ...bc, spent, remaining: bc.limit_amount - spent, pct, alert: alertLabel(pct) };
  });

  const totalBudget = rows.reduce((s, r) => s + Number(r.limit_amount), 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const overallLimit = budget?.total_limit ?? totalBudget;
  const overallPct = overallLimit > 0 ? (totalSpent / overallLimit) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Budget</h1>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((o) => o - 1)}>←</Button>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset(0)} disabled={monthOffset === 0}>Today</Button>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((o) => o + 1)}>→</Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            {budget ? <><Pencil className="mr-1 h-4 w-4" /> Edit</> : <><Plus className="mr-1 h-4 w-4" /> Create Budget</>}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !budget ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No budget for {monthLabel}. Create one to set category limits and get 80% / 90% / exceeded alerts.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Total Budget" value={formatBDT(overallLimit)} />
            <StatTile label="Spent" value={formatBDT(totalSpent)} tone="expense" />
            <StatTile label="Remaining" value={formatBDT(overallLimit - totalSpent)} tone={overallLimit - totalSpent < 0 ? 'danger' : 'income'} />
            <StatTile label="Used" value={`${overallPct.toFixed(0)}%`} tone={overallPct >= 100 ? 'danger' : 'default'} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-foreground">Overall</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Progress value={overallPct} tone={overallPct >= 100 ? 'danger' : overallPct >= 80 ? 'warn' : 'primary'} className="h-3" />
              <p className="text-xs text-muted-foreground">{formatBDT(totalSpent)} of {formatBDT(overallLimit)}</p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {rows.length === 0 && <p className="text-sm text-muted-foreground">No category budgets set.</p>}
            {rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{labelFor(r.category_key)}</p>
                    <span
                      className={
                        'rounded px-2 py-0.5 text-xs font-medium ' +
                        (r.alert.tone === 'danger'
                          ? 'bg-destructive/15 text-destructive'
                          : r.alert.tone === 'warn'
                          ? 'bg-amber-500/15 text-amber-600'
                          : 'bg-income/15 text-income')
                      }
                    >
                      {r.alert.text}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Budget {formatBDT(r.limit_amount)} · Spent {formatBDT(r.spent)}
                    </span>
                    <span className={r.remaining < 0 ? 'font-medium text-destructive' : 'font-medium'}>
                      {r.remaining < 0 ? `${formatBDT(r.remaining)} over` : `${formatBDT(r.remaining)} left`}
                    </span>
                  </div>
                  <Progress
                    value={r.pct}
                    tone={r.pct >= 100 ? 'danger' : r.pct >= 80 ? 'warn' : 'primary'}
                    className="mt-2"
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <BudgetFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
        editing={budget}
        defaultMonth={month}
      />
    </div>
  );
}
