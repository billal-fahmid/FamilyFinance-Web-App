'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { StatCard } from '@/components/dashboard/stat-card';
import { IncomeExpenseChart, type MonthlyPoint } from '@/components/dashboard/income-expense-chart';
import { CategoryChart, type CategorySlice } from '@/components/dashboard/category-chart';
import { RecentTransactions, type TxnRow } from '@/components/dashboard/recent-transactions';
import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { StatTile } from '@/components/ui/stat-tile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBDT, cn, toLocalISODate } from '@/lib/utils';
import { daysUntil, monthStartISO as currentMonthStart } from '@/lib/finance';
import { buildInsights, type Insight } from '@/lib/insights';

interface ObligationSummary {
  ccOutstanding: number;
  ccMinDue: number;
  ccOverdue: number;
  billsDueSoon: number;
  billsDueSoonAmount: number;
  loanOutstanding: number;
  budgetLimit: number;
  budgetSpent: number;
  netWorth: number | null;
}

export default function DashboardPage() {
  const { currentFamily, isLoading: familyLoading } = useFamily();
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ income: 0, expense: 0, accountBalance: 0 });
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);
  const [categories, setCategories] = useState<CategorySlice[]>([]);
  const [recent, setRecent] = useState<TxnRow[]>([]);
  const [obl, setObl] = useState<ObligationSummary | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [goals, setGoals] = useState<{ id: string; name: string; current_amount: number; target_amount: number; is_achieved: boolean }[]>([]);

  useEffect(() => {
    if (!currentFamily) return;

    (async () => {
      setLoading(true);
      const supabase = createClient();
      const familyId = currentFamily.id;

      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStartISO = toLocalISODate(monthStart);

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      const sixMonthsAgoISO = toLocalISODate(sixMonthsAgo);

      const [incomeThisMonth, expensesThisMonth, accounts, incomeHistory, expenseHistory, catRows, catList] =
        await Promise.all([
          supabase.from('income').select('amount').eq('family_id', familyId).is('deleted_at', null).gte('occurred_on', monthStartISO),
          supabase.from('expenses').select('amount').eq('family_id', familyId).is('deleted_at', null).gte('occurred_on', monthStartISO),
          supabase.from('accounts').select('current_balance').eq('family_id', familyId).eq('is_archived', false),
          supabase.from('income').select('amount, occurred_on').eq('family_id', familyId).is('deleted_at', null).gte('occurred_on', sixMonthsAgoISO),
          supabase.from('expenses').select('amount, occurred_on').eq('family_id', familyId).is('deleted_at', null).gte('occurred_on', sixMonthsAgoISO),
          supabase.from('expenses').select('category_key, amount').eq('family_id', familyId).is('deleted_at', null).gte('occurred_on', monthStartISO),
          supabase.from('categories').select('key, label').eq('type', 'expense'),
        ]);

      const totalIncome = (incomeThisMonth.data ?? []).reduce((s, r: any) => s + Number(r.amount), 0);
      const totalExpense = (expensesThisMonth.data ?? []).reduce((s, r: any) => s + Number(r.amount), 0);
      const accountBalance = (accounts.data ?? []).reduce((s, r: any) => s + Number(r.current_balance), 0);
      setTotals({ income: totalIncome, expense: totalExpense, accountBalance });

      // Monthly income vs expense, last 6 months
      const buckets: Record<string, MonthlyPoint> = {};
      const monthLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        buckets[monthLabel(d)] = { month: monthLabel(d), income: 0, expense: 0 };
      }
      (incomeHistory.data ?? []).forEach((r: any) => {
        const key = monthLabel(new Date(r.occurred_on));
        if (buckets[key]) buckets[key].income += Number(r.amount);
      });
      (expenseHistory.data ?? []).forEach((r: any) => {
        const key = monthLabel(new Date(r.occurred_on));
        if (buckets[key]) buckets[key].expense += Number(r.amount);
      });
      setMonthly(Object.values(buckets));

      // Category breakdown this month
      const labelMap: Record<string, string> = {};
      (catList.data ?? []).forEach((c: any) => (labelMap[c.key] = c.label));
      const catTotals: Record<string, number> = {};
      (catRows.data ?? []).forEach((r: any) => {
        catTotals[r.category_key] = (catTotals[r.category_key] ?? 0) + Number(r.amount);
      });
      setCategories(
        Object.entries(catTotals)
          .map(([key, value]) => ({ name: labelMap[key] ?? key, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 8)
      );

      // Recent transactions (merge last 5 income + expense)
      const [recentIncome, recentExpense] = await Promise.all([
        supabase
          .from('income')
          .select('id, amount, occurred_on, source, category_key')
          .eq('family_id', familyId)
          .is('deleted_at', null)
          .order('occurred_on', { ascending: false })
          .limit(5),
        supabase
          .from('expenses')
          .select('id, amount, occurred_on, merchant, category_key')
          .eq('family_id', familyId)
          .is('deleted_at', null)
          .order('occurred_on', { ascending: false })
          .limit(5),
      ]);

      const merged: TxnRow[] = [
        ...(recentIncome.data ?? []).map((r: any) => ({
          id: r.id,
          type: 'income' as const,
          label: r.source || r.category_key,
          amount: Number(r.amount),
          date: r.occurred_on,
        })),
        ...(recentExpense.data ?? []).map((r: any) => ({
          id: r.id,
          type: 'expense' as const,
          label: r.merchant || r.category_key,
          amount: Number(r.amount),
          date: r.occurred_on,
        })),
      ]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 8);

      setRecent(merged);

      // Milestone 2 — obligation summary cards
      const mStart = currentMonthStart();
      const nextMonth = new Date(mStart + 'T00:00:00');
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthISO = toLocalISODate(nextMonth);

      const prevMonthStart = new Date(mStart + 'T00:00:00');
      prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
      const prevMonthStartISO = toLocalISODate(prevMonthStart);

      const [cards, ccStmts, activeBills, loansRes, budgetRes, budgetSpendRes, prevSpend, prevIncome, nwSnaps] =
        await Promise.all([
          supabase.from('credit_cards').select('current_outstanding, minimum_payment, credit_limit').eq('family_id', familyId).eq('is_archived', false),
          supabase.from('credit_card_statements').select('remaining_dues').eq('family_id', familyId).eq('status', 'overdue'),
          supabase.from('bills').select('amount, next_due_date').eq('family_id', familyId).eq('is_active', true),
          supabase.from('loans').select('outstanding_balance').eq('family_id', familyId).eq('is_closed', false),
          supabase.from('budgets').select('total_limit, budget_categories(limit_amount)').eq('family_id', familyId).eq('month', mStart).maybeSingle(),
          supabase.from('v_unified_spend').select('amount, category_key').eq('family_id', familyId).gte('occurred_on', mStart).lt('occurred_on', nextMonthISO),
          supabase.from('v_unified_spend').select('amount, category_key').eq('family_id', familyId).gte('occurred_on', prevMonthStartISO).lt('occurred_on', mStart),
          supabase.from('income').select('amount').eq('family_id', familyId).is('deleted_at', null).gte('occurred_on', prevMonthStartISO).lt('occurred_on', mStart),
          supabase.from('net_worth_snapshots').select('net_worth, captured_on').eq('family_id', familyId).order('captured_on', { ascending: true }),
        ]);

      const { data: goalRows } = await supabase
        .from('savings_goals')
        .select('id, name, current_amount, target_amount, is_achieved')
        .eq('family_id', familyId)
        .order('created_at', { ascending: true })
        .limit(4);
      setGoals((goalRows as any[]) ?? []);

      const bills = (activeBills.data ?? []) as { amount: number; next_due_date: string }[];
      const dueSoon = bills.filter((b) => daysUntil(b.next_due_date) <= 7);
      const budgetCats = ((budgetRes.data as any)?.budget_categories ?? []) as { limit_amount: number }[];
      const budgetLimit =
        (budgetRes.data as any)?.total_limit ?? budgetCats.reduce((s, c) => s + Number(c.limit_amount), 0);
      const budgetSpent = (budgetSpendRes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const ccOutstanding = (cards.data ?? []).reduce((s: number, c: any) => s + Number(c.current_outstanding), 0);
      const ccLimit = (cards.data ?? []).reduce((s: number, c: any) => s + Number(c.credit_limit), 0);
      const loanOutstanding = (loansRes.data ?? []).reduce((s: number, l: any) => s + Number(l.outstanding_balance), 0);

      const snaps = (nwSnaps.data ?? []) as { net_worth: number; captured_on: string }[];
      const netWorth = snaps.length ? Number(snaps[snaps.length - 1].net_worth) : null;

      setObl({
        ccOutstanding,
        ccMinDue: (cards.data ?? []).reduce((s: number, c: any) => s + Number(c.minimum_payment), 0),
        ccOverdue: (ccStmts.data ?? []).reduce((s: number, r: any) => s + Number(r.remaining_dues), 0),
        billsDueSoon: dueSoon.length,
        billsDueSoonAmount: dueSoon.reduce((s, b) => s + Number(b.amount), 0),
        loanOutstanding,
        budgetLimit,
        budgetSpent,
        netWorth,
      });

      // Insights — compare this month vs previous month
      const catMap = (rows: any[] | null) => {
        const m: Record<string, number> = {};
        (rows ?? []).forEach((r) => { m[r.category_key] = (m[r.category_key] ?? 0) + Number(r.amount); });
        return m;
      };
      const curCat = catMap(budgetSpendRes.data as any[]);
      const prevCat = catMap(prevSpend.data as any[]);
      const prevExpTotal = Object.values(prevCat).reduce((s, v) => s + v, 0);
      const prevIncTotal = (prevIncome.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const nwChange =
        snaps.length >= 2
          ? {
              amount: Number(snaps[snaps.length - 1].net_worth) - Number(snaps[0].net_worth),
              months: Math.max(
                1,
                Math.round(
                  (new Date(snaps[snaps.length - 1].captured_on).getTime() - new Date(snaps[0].captured_on).getTime()) /
                    (1000 * 60 * 60 * 24 * 30)
                )
              ),
            }
          : null;

      setInsights(
        buildInsights({
          income: { current: totalIncome, previous: prevIncTotal },
          expense: { current: totalExpense, previous: prevExpTotal },
          byCategory: { current: curCat, previous: prevCat },
          categoryLabels: labelMap,
          savingsRate: totalIncome > 0 ? (totalIncome - totalExpense) / totalIncome : null,
          budget: budgetLimit > 0 ? { limit: budgetLimit, spent: budgetSpent } : null,
          creditUtilization: ccLimit > 0 ? (ccOutstanding / ccLimit) * 100 : null,
          netWorthChange: nwChange,
        })
      );

      setLoading(false);
    })();
  }, [currentFamily]);

  if (familyLoading || loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  const remaining = totals.income - totals.expense;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{currentFamily?.name}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total Income (MTD)" amount={totals.income} tone="income" />
        <StatCard label="Total Expenses (MTD)" amount={totals.expense} tone="expense" />
        <StatCard label="Remaining Balance" amount={remaining} />
        <StatCard label="Savings (Income - Expense)" amount={Math.max(remaining, 0)} />
        <StatCard label="Total Account Balance" amount={totals.accountBalance} />
      </div>

      {obl && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Link href="/net-worth" className="block">
            <StatTile
              className="h-full hover:shadow-md hover:border-ring/40"
              label="Net Worth"
              value={obl.netWorth === null ? '—' : formatBDT(obl.netWorth)}
              hint={obl.netWorth === null ? 'Capture a snapshot' : 'Latest snapshot'}
              tone={obl.netWorth !== null && obl.netWorth < 0 ? 'danger' : 'default'}
            />
          </Link>
          <Link href="/credit-cards" className="block">
            <StatTile
              className="h-full hover:shadow-md hover:border-ring/40"
              label="Credit Card Dues"
              value={formatBDT(obl.ccOutstanding)}
              hint={`Min due ${formatBDT(obl.ccMinDue)}${obl.ccOverdue > 0 ? ` · ${formatBDT(obl.ccOverdue)} overdue` : ''}`}
              tone={obl.ccOverdue > 0 ? 'danger' : 'default'}
            />
          </Link>
          <Link href="/bills" className="block">
            <StatTile
              className="h-full hover:shadow-md hover:border-ring/40"
              label="Upcoming Bills (7d)"
              value={formatBDT(obl.billsDueSoonAmount)}
              hint={`${obl.billsDueSoon} bill${obl.billsDueSoon === 1 ? '' : 's'} due soon`}
            />
          </Link>
          <Link href="/loans" className="block">
            <StatTile className="h-full hover:shadow-md hover:border-ring/40" label="Loan Outstanding" value={formatBDT(obl.loanOutstanding)} tone="expense" />
          </Link>
          <Link href="/budget" className="block">
            <StatTile
              className="h-full hover:shadow-md hover:border-ring/40"
              label="Budget Status"
              value={obl.budgetLimit > 0 ? `${((obl.budgetSpent / obl.budgetLimit) * 100).toFixed(0)}%` : '—'}
              hint={
                obl.budgetLimit > 0
                  ? `${formatBDT(obl.budgetSpent)} of ${formatBDT(obl.budgetLimit)}`
                  : 'No budget set'
              }
              tone={obl.budgetLimit > 0 && obl.budgetSpent > obl.budgetLimit ? 'danger' : 'default'}
            />
          </Link>
        </div>
      )}

      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Lightbulb className="h-4 w-4 text-primary" /> Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.map((ins) => (
              <div
                key={ins.id}
                className={cn(
                  'rounded-md border-l-4 bg-muted/40 px-3 py-2 text-sm',
                  ins.tone === 'positive' && 'border-l-income',
                  ins.tone === 'warning' && 'border-l-amber-500',
                  ins.tone === 'neutral' && 'border-l-muted-foreground/40'
                )}
              >
                {ins.text}
              </div>
            ))}
            <p className="pt-1 text-[11px] text-muted-foreground">
              Descriptive summaries of your numbers — not financial advice.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <IncomeExpenseChart data={monthly} />
        <CategoryChart data={categories} />
      </div>

      {goals.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-foreground">Savings Goals</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {goals.map((g) => {
              const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
              return (
                <Link key={g.id} href="/savings" className="block rounded-lg border p-3 transition-colors hover:border-ring/40">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', g.is_achieved ? 'bg-income' : 'bg-primary')}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatBDT(g.current_amount)} / {formatBDT(g.target_amount)}
                  </p>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      <RecentTransactions rows={recent} />
    </div>
  );
}
