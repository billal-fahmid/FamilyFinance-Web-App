'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TransactionList, type ListRow } from '@/components/transaction-list';
import { IncomeFormDialog } from '@/components/income/income-form-dialog';
import { ExpenseFormDialog } from '@/components/expense/expense-form-dialog';
import { exportCSV, exportXLSX, exportPDF, type ExportRow } from '@/lib/export';
import { toLocalISODate } from '@/lib/utils';
import { monthStartISO } from '@/lib/finance';
import type { Category, IncomeEntry, ExpenseEntry } from '@/types/database';

export default function TransactionsPage() {
  const { currentFamily } = useFamily();
  const [incomeRows, setIncomeRows] = useState<IncomeEntry[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeEntry | null>(null);
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  const [loadError, setLoadError] = useState<'needs-migration' | 'load-failed' | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);

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
    setLoadError(null);
    const supabase = createClient();

    const nextMonth = new Date(month + 'T00:00:00');
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthISO = toLocalISODate(nextMonth);

    let [income, expenses] = await Promise.all([
      supabase.from('income').select('*').eq('family_id', currentFamily.id).is('deleted_at', null)
        .gte('occurred_on', month).lt('occurred_on', nextMonthISO).order('occurred_on', { ascending: false }),
      supabase.from('expenses').select('*').eq('family_id', currentFamily.id).is('deleted_at', null)
        .gte('occurred_on', month).lt('occurred_on', nextMonthISO).order('occurred_on', { ascending: false }),
    ]);
    // Older DB without the Milestone 4 `deleted_at` column — retry without the filter.
    if (income.error?.code === '42703' || expenses.error?.code === '42703') {
      setLoadError('needs-migration');
      [income, expenses] = await Promise.all([
        supabase.from('income').select('*').eq('family_id', currentFamily.id)
          .gte('occurred_on', month).lt('occurred_on', nextMonthISO).order('occurred_on', { ascending: false }),
        supabase.from('expenses').select('*').eq('family_id', currentFamily.id)
          .gte('occurred_on', month).lt('occurred_on', nextMonthISO).order('occurred_on', { ascending: false }),
      ]);
    } else if (income.error || expenses.error) {
      setLoadError('load-failed');
    }
    const { data: cats } = await supabase.from('categories').select('*');
    setIncomeRows((income.data as IncomeEntry[]) ?? []);
    setExpenseRows((expenses.data as ExpenseEntry[]) ?? []);
    setCategories((cats as Category[]) ?? []);
  }, [currentFamily, month]);

  useEffect(() => {
    load();
  }, [load]);

  const labelFor = (key: string) => categories.find((c) => c.key === key)?.label ?? key;

  const incomeListRows: ListRow[] = incomeRows.map((r) => ({
    id: r.id,
    amount: r.amount,
    occurred_on: r.occurred_on,
    categoryLabel: labelFor(r.category_key),
    secondary: r.source,
  }));

  const expenseListRows: ListRow[] = expenseRows.map((r) => ({
    id: r.id,
    amount: r.amount,
    occurred_on: r.occurred_on,
    categoryLabel: labelFor(r.category_key),
    secondary: r.merchant,
  }));

  const trash = async (table: 'income' | 'expenses', id: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .eq('id', id);
    load();
  };

  const deleteIncome = async (id: string) => {
    if (!confirm('Move this income entry to Trash? You can restore it within 30 days.')) return;
    trash('income', id);
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('Move this expense to Trash? You can restore it within 30 days.')) return;
    trash('expenses', id);
  };

  const exportData = (which: 'expenses' | 'income') => {
    const cols = ['Date', 'Category', which === 'expenses' ? 'Merchant' : 'Source', 'Amount', 'Notes'];
    const rows: ExportRow[] =
      which === 'expenses'
        ? expenseRows.map((r) => ({
            Date: r.occurred_on, Category: labelFor(r.category_key), Merchant: r.merchant ?? '',
            Amount: Number(r.amount), Notes: r.notes ?? '',
          }))
        : incomeRows.map((r) => ({
            Date: r.occurred_on, Category: labelFor(r.category_key), Source: r.source ?? '',
            Amount: Number(r.amount), Notes: r.notes ?? '',
          }));
    return { cols, rows };
  };

  const doExport = (which: 'expenses' | 'income', fmt: 'csv' | 'xlsx' | 'pdf') => {
    const { cols, rows } = exportData(which);
    const name = `${which}-${monthLabel.replace(/ /g, '-')}`;
    if (fmt === 'csv') exportCSV(name, cols, rows);
    else if (fmt === 'xlsx') exportXLSX(name, [{ name: which, columns: cols, rows }]);
    else exportPDF(name, which === 'expenses' ? 'Expenses' : 'Income', [{ columns: cols, rows }]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Transactions</h1>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((o) => o - 1)}>←</Button>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset(0)} disabled={monthOffset === 0}>This month</Button>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((o) => o + 1)}>→</Button>
        </div>
      </div>

      {loadError === 'needs-migration' && (
        <div className="rounded-lg border border-amber-500/40 bg-brand-gold/10 p-3 text-sm text-amber-800">
          Your database is missing the latest update — run <code>supabase/apply_all.sql</code> in the
          Supabase SQL Editor to enable Trash, and to make deleted items hide correctly.
        </div>
      )}
      {loadError === 'load-failed' && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Couldn&apos;t load transactions. Check your connection and try again.
        </div>
      )}

      <Tabs defaultValue="expenses">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="expenses">
          <div className="mb-3 flex justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline"><Download className="mr-1 h-4 w-4" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => doExport('expenses', 'csv')}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport('expenses', 'xlsx')}>Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport('expenses', 'pdf')}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => { setEditingExpense(null); setExpenseDialogOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Add Expense
            </Button>
          </div>
          <TransactionList
            rows={expenseListRows}
            categoryOptions={categories.filter((c) => c.type === 'expense')}
            tone="expense"
            onEdit={(id) => { setEditingExpense(expenseRows.find((r) => r.id === id) ?? null); setExpenseDialogOpen(true); }}
            onDelete={deleteExpense}
          />
        </TabsContent>

        <TabsContent value="income">
          <div className="mb-3 flex justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline"><Download className="mr-1 h-4 w-4" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => doExport('income', 'csv')}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport('income', 'xlsx')}>Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport('income', 'pdf')}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => { setEditingIncome(null); setIncomeDialogOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Add Income
            </Button>
          </div>
          <TransactionList
            rows={incomeListRows}
            categoryOptions={categories.filter((c) => c.type === 'income')}
            tone="income"
            onEdit={(id) => { setEditingIncome(incomeRows.find((r) => r.id === id) ?? null); setIncomeDialogOpen(true); }}
            onDelete={deleteIncome}
          />
        </TabsContent>
      </Tabs>

      <IncomeFormDialog
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        onSaved={load}
        editing={editingIncome}
      />
      <ExpenseFormDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        onSaved={load}
        editing={editingExpense}
      />
    </div>
  );
}
