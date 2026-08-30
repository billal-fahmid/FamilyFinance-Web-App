'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Globe } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Card, CardContent } from '@/components/ui/card';
import { RemittanceDialog } from '@/components/wealth/remittance-dialog';
import { formatBDT, formatDate } from '@/lib/utils';
import type { Remittance, IncomeEntry } from '@/types/database';

type Row = Remittance & { income?: Pick<IncomeEntry, 'amount' | 'occurred_on' | 'account_id'> };

export default function RemittancePage() {
  const { currentFamily } = useFamily();
  const [rows, setRows] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const [{ data }, { data: accs }] = await Promise.all([
      supabase
        .from('remittances')
        .select('*, income:income_id (amount, occurred_on, account_id)')
        .eq('family_id', currentFamily.id)
        .order('created_at', { ascending: false }),
      supabase.from('accounts').select('id, name').eq('family_id', currentFamily.id),
    ]);
    setRows((data as Row[]) ?? []);
    setAccounts(Object.fromEntries(((accs as any[]) ?? []).map((a) => [a.id, a.name])));
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (r: Row) => {
    if (!confirm('Delete this remittance? The linked income entry is also removed.')) return;
    const supabase = createClient();
    await supabase.from('income').delete().eq('id', r.income_id); // cascade removes the remittance
    load();
  };

  const totalBDT = rows.reduce((s, r) => s + Number(r.income?.amount ?? 0), 0);
  const thisYear = rows.filter((r) => (r.income?.occurred_on ?? '').startsWith(String(new Date().getFullYear())));
  const yearBDT = thisYear.reduce((s, r) => s + Number(r.income?.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Remittance</h1>
          <p className="text-sm text-muted-foreground">Money received from abroad</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Record Remittance
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No remittances recorded. Log money sent home — the foreign amount, exchange rate and BDT received.
          Each one is also added to income.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Total Received" value={formatBDT(totalBDT)} tone="income" />
            <StatTile label={`Received in ${new Date().getFullYear()}`} value={formatBDT(yearBDT)} tone="income" />
            <StatTile label="Transfers" value={String(rows.length)} />
          </div>

          <div className="space-y-2">
            {rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Globe className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-medium">
                        {r.sender_name} <span className="text-xs text-muted-foreground">· {r.country}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.foreign_currency} {Number(r.foreign_amount).toLocaleString()} × ৳{r.exchange_rate}
                        {r.income?.occurred_on ? ` · ${formatDate(r.income.occurred_on)}` : ''}
                        {r.income?.account_id && accounts[r.income.account_id] ? ` → ${accounts[r.income.account_id]}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums text-income">{formatBDT(r.income?.amount ?? 0)}</span>
                    <button onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <RemittanceDialog open={open} onOpenChange={setOpen} onSaved={load} />
    </div>
  );
}
