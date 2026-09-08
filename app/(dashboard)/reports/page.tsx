'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatBDT, toLocalISODate } from '@/lib/utils';
import { exportCSV, exportXLSX, exportPDF, type ExportRow } from '@/lib/export';
import type { Category, FamilyMember } from '@/types/database';

const sum = (rows: any[] | null, key = 'amount') => (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);

export default function ReportsPage() {
  const { currentFamily } = useFamily();
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthOffset, setMonthOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState<Category[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);

  const [monthly, setMonthly] = useState<any>(null);
  const [yearly, setYearly] = useState<any>(null);
  const [cc, setCc] = useState<any>(null);
  const [byMember, setByMember] = useState<any[]>([]);

  const month = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);
  const monthISO = toLocalISODate(month);
  const monthEnd = toLocalISODate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const catLabel = useCallback((k: string) => cats.find((c) => c.key === k)?.label ?? k, [cats]);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const fam = currentFamily.id;
    const yStart = `${year}-01-01`;
    const yEnd = `${year + 1}-01-01`;

    const [
      mInc, mExp, mCcTxn, mCcPay, mLoanPay, mBillPay, mContrib,
      yInc, yExp,
      ccTxnAll, ccPayAll,
      memInc, memExp, memList, catList,
    ] = await Promise.all([
      supabase.from('income').select('amount').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', monthISO).lt('occurred_on', monthEnd),
      supabase.from('expenses').select('amount, category_key').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', monthISO).lt('occurred_on', monthEnd),
      supabase.from('credit_card_transactions').select('amount, type').eq('family_id', fam).gte('occurred_on', monthISO).lt('occurred_on', monthEnd),
      supabase.from('credit_card_payments').select('amount').eq('family_id', fam).gte('occurred_on', monthISO).lt('occurred_on', monthEnd),
      supabase.from('loan_payments').select('amount').eq('family_id', fam).gte('paid_on', monthISO).lt('paid_on', monthEnd),
      supabase.from('bill_payments').select('amount').eq('family_id', fam).gte('paid_on', monthISO).lt('paid_on', monthEnd),
      supabase.from('savings_contributions').select('amount').eq('family_id', fam).gte('contributed_on', monthISO).lt('contributed_on', monthEnd),

      supabase.from('income').select('amount, occurred_on').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', yStart).lt('occurred_on', yEnd),
      supabase.from('expenses').select('amount, occurred_on, category_key').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', yStart).lt('occurred_on', yEnd),

      supabase.from('credit_card_transactions').select('amount, type').eq('family_id', fam).gte('occurred_on', yStart).lt('occurred_on', yEnd),
      supabase.from('credit_card_payments').select('amount').eq('family_id', fam).gte('occurred_on', yStart).lt('occurred_on', yEnd),

      supabase.from('income').select('amount, person_id').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', yStart).lt('occurred_on', yEnd),
      supabase.from('expenses').select('amount, person_id, scope').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', yStart).lt('occurred_on', yEnd),
      supabase.from('family_members').select('*').eq('family_id', fam).eq('status', 'active'),
      supabase.from('categories').select('*'),
    ]);

    setCats((catList.data as Category[]) ?? []);
    setMembers((memList.data as FamilyMember[]) ?? []);

    // Monthly
    const mExpByCat: Record<string, number> = {};
    (mExp.data ?? []).forEach((r: any) => { mExpByCat[r.category_key] = (mExpByCat[r.category_key] ?? 0) + Number(r.amount); });
    setMonthly({
      income: sum(mInc.data),
      expense: sum(mExp.data),
      ccSpending: sum((mCcTxn.data ?? []).filter((r: any) => !['refund', 'adjustment'].includes(r.type))),
      ccPayments: sum(mCcPay.data),
      loanPayments: sum(mLoanPay.data),
      billPayments: sum(mBillPay.data),
      savings: sum(mContrib.data),
      byCat: mExpByCat,
    });

    // Yearly
    const monthsArr = Array.from({ length: 12 }, (_, i) => ({ m: i, income: 0, expense: 0 }));
    (yInc.data ?? []).forEach((r: any) => { monthsArr[new Date(r.occurred_on).getMonth()].income += Number(r.amount); });
    (yExp.data ?? []).forEach((r: any) => { monthsArr[new Date(r.occurred_on).getMonth()].expense += Number(r.amount); });
    const yExpByCat: Record<string, number> = {};
    (yExp.data ?? []).forEach((r: any) => { yExpByCat[r.category_key] = (yExpByCat[r.category_key] ?? 0) + Number(r.amount); });
    setYearly({ income: sum(yInc.data), expense: sum(yExp.data), months: monthsArr, byCat: yExpByCat });

    // Credit card (year)
    const byType: Record<string, number> = {};
    (ccTxnAll.data ?? []).forEach((r: any) => { byType[r.type] = (byType[r.type] ?? 0) + Number(r.amount); });
    setCc({
      spending: sum((ccTxnAll.data ?? []).filter((r: any) => ['purchase', 'online_purchase', 'pos_purchase', 'emi_purchase', 'cash_advance'].includes(r.type))),
      payments: sum(ccPayAll.data),
      fees: byType['fee'] ?? 0,
      interest: byType['interest'] ?? 0,
      emi: byType['emi_purchase'] ?? 0,
      byType,
    });

    // Per member (year)
    const memMap: Record<string, { income: number; expense: number; shared: number }> = {};
    (memInc.data ?? []).forEach((r: any) => {
      const k = r.person_id ?? 'unassigned';
      memMap[k] ??= { income: 0, expense: 0, shared: 0 };
      memMap[k].income += Number(r.amount);
    });
    (memExp.data ?? []).forEach((r: any) => {
      const k = r.person_id ?? 'unassigned';
      memMap[k] ??= { income: 0, expense: 0, shared: 0 };
      memMap[k].expense += Number(r.amount);
      if (r.scope === 'shared') memMap[k].shared += Number(r.amount);
    });
    setByMember(Object.entries(memMap).map(([k, v]) => ({ id: k, ...v })));

    setLoading(false);
  }, [currentFamily, monthISO, monthEnd, year]);

  useEffect(() => { load(); }, [load]);

  const memberName = (id: string) =>
    id === 'unassigned' ? 'Unassigned' : members.find((m) => m.id === id)?.display_name ?? id;

  if (loading || !monthly || !yearly || !cc) {
    return <p className="p-6 text-sm text-muted-foreground">Building reports…</p>;
  }

  const mRemaining = monthly.income - monthly.expense;

  const monthlyRows: ExportRow[] = [
    { Metric: 'Income', Amount: Math.round(monthly.income) },
    { Metric: 'Expenses', Amount: Math.round(monthly.expense) },
    { Metric: 'Savings contributions', Amount: Math.round(monthly.savings) },
    { Metric: 'Credit-card spending', Amount: Math.round(monthly.ccSpending) },
    { Metric: 'Credit-card payments', Amount: Math.round(monthly.ccPayments) },
    { Metric: 'Loan payments', Amount: Math.round(monthly.loanPayments) },
    { Metric: 'Bill payments', Amount: Math.round(monthly.billPayments) },
    { Metric: 'Remaining balance (income − expense)', Amount: Math.round(mRemaining) },
  ];

  const exportMenu = (
    name: string,
    title: string,
    columns: string[],
    rows: ExportRow[]
  ) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline"><Download className="mr-1 h-4 w-4" /> Export</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportCSV(name, columns, rows)}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportXLSX(name, [{ name: title, columns, rows }])}>Excel</DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportPDF(name, title, [{ columns, rows }])}>PDF</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Financial Reports</h1>
        <p className="text-sm text-muted-foreground">Monthly, yearly, credit card & per-member summaries</p>
      </div>

      <Tabs defaultValue="monthly">
        <TabsList className="flex-wrap">
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="yearly">Yearly</TabsTrigger>
          <TabsTrigger value="credit">Credit Card</TabsTrigger>
          <TabsTrigger value="member">Members</TabsTrigger>
        </TabsList>

        {/* MONTHLY */}
        <TabsContent value="monthly" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setMonthOffset((o) => o - 1)}>←</Button>
              <span className="text-sm font-medium">{monthLabel}</span>
              <Button size="sm" variant="outline" onClick={() => setMonthOffset((o) => o + 1)} disabled={monthOffset >= 0}>→</Button>
            </div>
            {exportMenu('monthly-report', `Monthly Report ${monthLabel}`, ['Metric', 'Amount'], monthlyRows)}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Income" value={formatBDT(monthly.income)} tone="income" />
            <StatTile label="Expenses" value={formatBDT(monthly.expense)} tone="expense" />
            <StatTile label="Savings" value={formatBDT(monthly.savings)} />
            <StatTile label="Remaining" value={formatBDT(mRemaining)} tone={mRemaining < 0 ? 'danger' : 'default'} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Credit-card spending" value={formatBDT(monthly.ccSpending)} />
            <StatTile label="Credit-card payments" value={formatBDT(monthly.ccPayments)} />
            <StatTile label="Loan payments" value={formatBDT(monthly.loanPayments)} />
            <StatTile label="Bill payments" value={formatBDT(monthly.billPayments)} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-foreground">Expenses by category</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {Object.entries(monthly.byCat as Record<string, number>)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{catLabel(k)}</span>
                    <span className="font-medium tabular-nums">{formatBDT(v)}</span>
                  </div>
                ))}
              {Object.keys(monthly.byCat).length === 0 && <p className="text-muted-foreground">No expenses this month.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* YEARLY */}
        <TabsContent value="yearly" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setYear((y) => y - 1)}>←</Button>
              <span className="text-sm font-medium">{year}</span>
              <Button size="sm" variant="outline" onClick={() => setYear((y) => y + 1)} disabled={year >= new Date().getFullYear()}>→</Button>
            </div>
            {exportMenu(
              `yearly-report-${year}`,
              `Yearly Report ${year}`,
              ['Month', 'Income', 'Expense', 'Net'],
              yearly.months.map((m: any) => ({
                Month: new Date(year, m.m, 1).toLocaleDateString('en-US', { month: 'short' }),
                Income: Math.round(m.income),
                Expense: Math.round(m.expense),
                Net: Math.round(m.income - m.expense),
              }))
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Annual Income" value={formatBDT(yearly.income)} tone="income" />
            <StatTile label="Annual Expense" value={formatBDT(yearly.expense)} tone="expense" />
            <StatTile label="Annual Savings" value={formatBDT(yearly.income - yearly.expense)} tone={yearly.income - yearly.expense < 0 ? 'danger' : 'default'} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-foreground">Monthly trend</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr><th className="px-4 py-2">Month</th><th className="px-4 py-2 text-right">Income</th><th className="px-4 py-2 text-right">Expense</th><th className="px-4 py-2 text-right">Net</th></tr>
                </thead>
                <tbody className="divide-y">
                  {yearly.months.map((m: any) => (
                    <tr key={m.m}>
                      <td className="px-4 py-2">{new Date(year, m.m, 1).toLocaleDateString('en-US', { month: 'long' })}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-income">{formatBDT(m.income)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-expense">{formatBDT(m.expense)}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{formatBDT(m.income - m.expense)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-foreground">Category comparison</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {Object.entries(yearly.byCat as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{catLabel(k)}</span>
                  <span className="font-medium tabular-nums">{formatBDT(v)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CREDIT CARD */}
        <TabsContent value="credit" className="space-y-4">
          <div className="flex items-center justify-end">
            {exportMenu('credit-card-report', `Credit Card Report ${year}`, ['Metric', 'Amount'], [
              { Metric: 'Spending', Amount: Math.round(cc.spending) },
              { Metric: 'Payments', Amount: Math.round(cc.payments) },
              { Metric: 'Fees', Amount: Math.round(cc.fees) },
              { Metric: 'Interest', Amount: Math.round(cc.interest) },
              { Metric: 'EMI purchases', Amount: Math.round(cc.emi) },
            ])}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Spending" value={formatBDT(cc.spending)} tone="expense" />
            <StatTile label="Payments" value={formatBDT(cc.payments)} tone="income" />
            <StatTile label="Fees" value={formatBDT(cc.fees)} />
            <StatTile label="Interest" value={formatBDT(cc.interest)} tone="danger" />
            <StatTile label="EMI purchases" value={formatBDT(cc.emi)} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-foreground">By transaction type ({year})</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {Object.entries(cc.byType as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="font-medium tabular-nums">{formatBDT(v)}</span>
                </div>
              ))}
              {Object.keys(cc.byType).length === 0 && <p className="text-muted-foreground">No card activity this year.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MEMBERS */}
        <TabsContent value="member" className="space-y-4">
          <div className="flex items-center justify-end">
            {exportMenu('member-report', `Family Member Report ${year}`, ['Member', 'Income', 'Expenses', 'Shared expenses'],
              byMember.map((m) => ({
                Member: memberName(m.id), Income: Math.round(m.income),
                Expenses: Math.round(m.expense), 'Shared expenses': Math.round(m.shared),
              }))
            )}
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Member</th>
                    <th className="px-4 py-2 text-right">Income</th>
                    <th className="px-4 py-2 text-right">Expenses</th>
                    <th className="px-4 py-2 text-right">Shared</th>
                    <th className="px-4 py-2 text-right">Net contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {byMember.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2">{memberName(m.id)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-income">{formatBDT(m.income)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-expense">{formatBDT(m.expense)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatBDT(m.shared)}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{formatBDT(m.income - m.expense)}</td>
                    </tr>
                  ))}
                  {byMember.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No data for {year}.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
