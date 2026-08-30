'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBDT, formatDate } from '@/lib/utils';
import { monthStartISO } from '@/lib/finance';
import type { NetWorthSnapshot } from '@/types/database';

interface Live {
  cash: number;
  investments: number;
  assets: number;
  loans: number;
  cc: number;
}

export default function NetWorthPage() {
  const { currentFamily } = useFamily();
  const [live, setLive] = useState<Live | null>(null);
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const fam = currentFamily.id;
    const [accts, inv, ast, lns, cc, snaps] = await Promise.all([
      supabase.from('accounts').select('current_balance').eq('family_id', fam).eq('is_archived', false),
      supabase.from('investments').select('current_value').eq('family_id', fam).eq('is_active', true),
      supabase.from('assets').select('current_value').eq('family_id', fam),
      supabase.from('loans').select('outstanding_balance').eq('family_id', fam).eq('is_closed', false),
      supabase.from('credit_cards').select('current_outstanding').eq('family_id', fam).eq('is_archived', false),
      supabase.from('net_worth_snapshots').select('*').eq('family_id', fam).order('captured_on', { ascending: true }),
    ]);
    const sum = (rows: any[] | null, key: string) => (rows ?? []).reduce((s, r) => s + Number(r[key]), 0);
    setLive({
      cash: sum(accts.data, 'current_balance'),
      investments: sum(inv.data, 'current_value'),
      assets: sum(ast.data, 'current_value'),
      loans: sum(lns.data, 'outstanding_balance'),
      cc: sum(cc.data, 'current_outstanding'),
    });
    setSnapshots((snaps.data as NetWorthSnapshot[]) ?? []);
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-capture one snapshot per month, once data has loaded
  const [autoDone, setAutoDone] = useState(false);
  useEffect(() => {
    if (!currentFamily || loading || !live || autoDone) return;
    setAutoDone(true);
    const hasThisMonth = snapshots.some((s) => s.captured_on >= monthStartISO());
    if (!hasThisMonth) {
      const supabase = createClient();
      supabase.rpc('capture_net_worth', { fam: currentFamily.id }).then(() => load());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFamily, loading, live, autoDone]);

  const capture = async () => {
    if (!currentFamily) return;
    setCapturing(true);
    const supabase = createClient();
    await supabase.rpc('capture_net_worth', { fam: currentFamily.id });
    await load();
    setCapturing(false);
  };

  const totalAssets = live ? live.cash + live.investments + live.assets : 0;
  const totalLiabilities = live ? live.loans + live.cc : 0;
  const netWorth = totalAssets - totalLiabilities;

  const chartData = useMemo(
    () =>
      snapshots.map((s) => ({
        date: new Date(s.captured_on + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        netWorth: Number(s.net_worth),
        assets: Number(s.total_assets),
        liabilities: Number(s.total_liabilities),
      })),
    [snapshots]
  );

  const breakdown = live
    ? [
        { label: 'Cash & Bank', value: live.cash, kind: 'asset' as const },
        { label: 'Investments', value: live.investments, kind: 'asset' as const },
        { label: 'Property & Assets', value: live.assets, kind: 'asset' as const },
        { label: 'Loans', value: -live.loans, kind: 'liability' as const },
        { label: 'Credit Card Outstanding', value: -live.cc, kind: 'liability' as const },
      ]
    : [];

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Net Worth</h1>
          <p className="text-sm text-muted-foreground">Assets minus liabilities, right now</p>
        </div>
        <Button size="sm" onClick={capture} disabled={capturing}>
          {capturing ? <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> : <Camera className="mr-1 h-4 w-4" />}
          Capture snapshot
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Total Assets" value={formatBDT(totalAssets)} tone="income" />
        <StatTile label="Total Liabilities" value={formatBDT(totalLiabilities)} tone="expense" />
        <StatTile
          label="Net Worth"
          value={formatBDT(netWorth)}
          tone={netWorth >= 0 ? 'default' : 'danger'}
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-foreground">Breakdown</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {breakdown.map((b) => (
            <div key={b.label} className="flex items-center justify-between text-sm">
              <span className={b.kind === 'liability' ? 'text-muted-foreground' : ''}>{b.label}</span>
              <span
                className={
                  'font-medium tabular-nums ' + (b.value < 0 ? 'text-destructive' : 'text-foreground')
                }
              >
                {b.value < 0 ? '−' : ''}{formatBDT(Math.abs(b.value))}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
            <span>Net Worth</span>
            <span className="tabular-nums">{formatBDT(netWorth)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Net Worth Over Time</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {chartData.length < 2 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              Capture snapshots over time (auto once a month, or the button above) to build this chart.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatBDT(v, { withSymbol: false })}
                />
                <Tooltip formatter={(v: number) => formatBDT(v)} />
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  name="Net Worth"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#nw)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {snapshots.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-foreground">Snapshots</CardTitle></CardHeader>
          <CardContent className="divide-y p-0">
            {[...snapshots].reverse().map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">{formatDate(s.captured_on)}</span>
                <span className="font-medium tabular-nums">{formatBDT(s.net_worth)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
