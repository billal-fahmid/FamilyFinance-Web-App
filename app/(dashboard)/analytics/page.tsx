'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatBDT, toLocalISODate } from '@/lib/utils';
import { monthStartISO, utilization } from '@/lib/finance';
import { CHART_PALETTE as PALETTE, BRAND } from '@/lib/chart-colors';
import type { Category, CreditCard, FamilyMember, NetWorthSnapshot, SavingsGoal } from '@/types/database';

const monthKey = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });

function ChartCard({ title, children, height = 288 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-foreground">{title}</CardTitle></CardHeader>
      <CardContent style={{ height }}>{children}</CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { currentFamily } = useFamily();
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [savingsSeries, setSavingsSeries] = useState<any[]>([]);
  const [catSlices, setCatSlices] = useState<any[]>([]);
  const [memberSpend, setMemberSpend] = useState<any[]>([]);
  const [ccSeries, setCcSeries] = useState<any[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [netWorth, setNetWorth] = useState<NetWorthSnapshot[]>([]);
  const [debtSeries, setDebtSeries] = useState<any[]>([]);
  const [budgetRows, setBudgetRows] = useState<any[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const fam = currentFamily.id;
    const start = new Date();
    start.setMonth(start.getMonth() - 5);
    start.setDate(1);
    const startISO = toLocalISODate(start);
    const mStart = monthStartISO();
    const mEnd = toLocalISODate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1));

    const [inc, exp, contrib, catRows, catList, memExp, memList, ccTxn, ccList, nws, loanPay, budget, spend, goalList] =
      await Promise.all([
        supabase.from('income').select('amount, occurred_on').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', startISO),
        supabase.from('expenses').select('amount, occurred_on, category_key, person_id').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', startISO),
        supabase.from('savings_contributions').select('amount, contributed_on').eq('family_id', fam).gte('contributed_on', startISO),
        supabase.from('expenses').select('amount, category_key').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', mStart).lt('occurred_on', mEnd),
        supabase.from('categories').select('*').eq('type', 'expense'),
        supabase.from('expenses').select('amount, person_id').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', mStart).lt('occurred_on', mEnd),
        supabase.from('family_members').select('*').eq('family_id', fam).eq('status', 'active'),
        supabase.from('credit_card_transactions').select('amount, occurred_on, type').eq('family_id', fam).gte('occurred_on', startISO),
        supabase.from('credit_cards').select('*').eq('family_id', fam).eq('is_archived', false),
        supabase.from('net_worth_snapshots').select('*').eq('family_id', fam).order('captured_on', { ascending: true }),
        supabase.from('loan_payments').select('amount, paid_on').eq('family_id', fam).gte('paid_on', startISO),
        supabase.from('budgets').select('*, budget_categories(*)').eq('family_id', fam).eq('month', mStart).maybeSingle(),
        supabase.from('v_unified_spend').select('amount, category_key').eq('family_id', fam).gte('occurred_on', mStart).lt('occurred_on', mEnd),
        supabase.from('savings_goals').select('*').eq('family_id', fam),
      ]);

    const cl = (catList.data as Category[]) ?? [];
    const label = (k: string) => cl.find((c) => c.key === k)?.label ?? k;

    // 6-month buckets
    const buckets: Record<string, any> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      buckets[monthKey(d)] = { month: monthKey(d), income: 0, expense: 0, savings: 0, cc: 0, debt: 0 };
    }
    (inc.data ?? []).forEach((r: any) => { const k = monthKey(new Date(r.occurred_on)); if (buckets[k]) buckets[k].income += Number(r.amount); });
    (exp.data ?? []).forEach((r: any) => { const k = monthKey(new Date(r.occurred_on)); if (buckets[k]) buckets[k].expense += Number(r.amount); });
    (contrib.data ?? []).forEach((r: any) => { const k = monthKey(new Date(r.contributed_on)); if (buckets[k]) buckets[k].savings += Number(r.amount); });
    (ccTxn.data ?? []).forEach((r: any) => {
      const k = monthKey(new Date(r.occurred_on));
      if (buckets[k] && !['refund', 'adjustment'].includes(r.type)) buckets[k].cc += Number(r.amount);
    });
    (loanPay.data ?? []).forEach((r: any) => { const k = monthKey(new Date(r.paid_on)); if (buckets[k]) buckets[k].debt += Number(r.amount); });

    const arr = Object.values(buckets);
    setMonthly(arr);
    setSavingsSeries(arr.map((b: any) => ({ month: b.month, savings: b.savings, rate: b.income > 0 ? Math.round((b.savings / b.income) * 100) : 0 })));
    setCcSeries(arr.map((b: any) => ({ month: b.month, spending: b.cc })));
    setDebtSeries(arr.map((b: any) => ({ month: b.month, repaid: b.debt })));

    // category pie (this month)
    const catTotals: Record<string, number> = {};
    (catRows.data ?? []).forEach((r: any) => { catTotals[r.category_key] = (catTotals[r.category_key] ?? 0) + Number(r.amount); });
    setCatSlices(
      Object.entries(catTotals).map(([k, v]) => ({ name: label(k), value: v })).sort((a, b) => b.value - a.value).slice(0, 8)
    );

    // member spending
    const ml = (memList.data as FamilyMember[]) ?? [];
    const mName = (id: string | null) => (id ? ml.find((m) => m.id === id)?.display_name ?? 'Member' : 'Unassigned');
    const memTotals: Record<string, number> = {};
    (memExp.data ?? []).forEach((r: any) => { const k = mName(r.person_id); memTotals[k] = (memTotals[k] ?? 0) + Number(r.amount); });
    setMemberSpend(Object.entries(memTotals).map(([name, value]) => ({ name, value })));

    setCards((ccList.data as CreditCard[]) ?? []);
    setNetWorth((nws.data as NetWorthSnapshot[]) ?? []);
    setGoals((goalList.data as SavingsGoal[]) ?? []);

    // budget performance
    const bcats = ((budget.data as any)?.budget_categories ?? []) as { category_key: string; limit_amount: number }[];
    const spendByCat: Record<string, number> = {};
    ((spend.data as any[]) ?? []).forEach((r) => { spendByCat[r.category_key] = (spendByCat[r.category_key] ?? 0) + Number(r.amount); });
    setBudgetRows(
      bcats.map((bc) => ({
        name: label(bc.category_key),
        budget: Number(bc.limit_amount),
        spent: spendByCat[bc.category_key] ?? 0,
      }))
    );

    setLoading(false);
  }, [currentFamily]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Building analytics…</p>;

  const yAxis = { tick: { fontSize: 12 }, axisLine: false, tickLine: false, tickFormatter: (v: number) => formatBDT(v, { withSymbol: false }) } as const;
  const xAxis = { tick: { fontSize: 12 }, axisLine: false, tickLine: false } as const;

  const nwData = netWorth.map((s) => ({
    date: new Date(s.captured_on + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    netWorth: Number(s.net_worth),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Last 6 months unless noted</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Income vs Expense">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="month" {...xAxis} />
              <YAxis {...yAxis} />
              <Tooltip formatter={(v: number) => formatBDT(v)} />
              <Legend />
              <Bar dataKey="income" name="Income" fill="hsl(var(--income))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Expense" fill="hsl(var(--expense))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly Savings & Rate">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={savingsSeries}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="month" {...xAxis} />
              <YAxis {...yAxis} />
              <Tooltip formatter={(v: number, n) => (n === 'rate' ? `${v}%` : formatBDT(v))} />
              <Bar dataKey="savings" name="Saved" fill={BRAND.green} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Expense Categories (this month)">
          {catSlices.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No expenses yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catSlices} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                  {catSlices.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatBDT(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Member Spending (this month)">
          {memberSpend.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No expenses yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={memberSpend} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                <XAxis type="number" {...yAxis} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip formatter={(v: number) => formatBDT(v)} />
                <Bar dataKey="value" name="Spent" fill={BRAND.blue} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Credit-Card Spending">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ccSeries}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="month" {...xAxis} />
              <YAxis {...yAxis} />
              <Tooltip formatter={(v: number) => formatBDT(v)} />
              <Line type="monotone" dataKey="spending" name="Spending" stroke={BRAND.orange} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Debt Repaid (loan payments)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={debtSeries}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="month" {...xAxis} />
              <YAxis {...yAxis} />
              <Tooltip formatter={(v: number) => formatBDT(v)} />
              <Bar dataKey="repaid" name="Repaid" fill={BRAND.deep} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Net Worth">
          {nwData.length < 2 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              Capture net-worth snapshots over time to plot this.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={nwData}>
                <defs>
                  <linearGradient id="nwa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis dataKey="date" {...xAxis} />
                <YAxis {...yAxis} />
                <Tooltip formatter={(v: number) => formatBDT(v)} />
                <Area type="monotone" dataKey="netWorth" name="Net Worth" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#nwa)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Budget Performance (this month)">
          {budgetRows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No budget set this month</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetRows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis {...yAxis} />
                <Tooltip formatter={(v: number) => formatBDT(v)} />
                <Legend />
                <Bar dataKey="budget" name="Budget" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spent" name="Spent" fill="hsl(var(--expense))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-foreground">Credit Utilization</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {cards.length === 0 && <p className="text-sm text-muted-foreground">No credit cards.</p>}
            {cards.map((c) => {
              const u = utilization(c);
              return (
                <div key={c.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{c.provider} {c.card_name}</span>
                    <span className="font-medium">{u.toFixed(0)}%</span>
                  </div>
                  <Progress value={u} tone={u >= 80 ? 'danger' : u >= 50 ? 'warn' : 'ok'} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-foreground">Savings Goals Progress</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {goals.length === 0 && <p className="text-sm text-muted-foreground">No savings goals.</p>}
            {goals.map((g) => {
              const p = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
              return (
                <div key={g.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{g.name}</span>
                    <span className="font-medium">{p.toFixed(0)}%</span>
                  </div>
                  <Progress value={p} tone={g.is_achieved ? 'ok' : 'primary'} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
