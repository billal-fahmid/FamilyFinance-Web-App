'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Card, CardContent } from '@/components/ui/card';
import { InvestmentDialog } from '@/components/wealth/investment-dialog';
import { formatBDT, formatDate, cn } from '@/lib/utils';
import { INVESTMENT_TYPES } from '@/lib/validations/wealth';
import type { FamilyMember, Investment } from '@/types/database';

const TYPE_LABEL = Object.fromEntries(INVESTMENT_TYPES.map((t) => [t.key, t.label]));

export default function InvestmentsPage() {
  const { currentFamily } = useFamily();
  const [items, setItems] = useState<Investment[]>([]);
  const [members, setMembers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const [{ data }, { data: mem }] = await Promise.all([
      supabase.from('investments').select('*').eq('family_id', currentFamily.id).order('created_at', { ascending: true }),
      supabase.from('family_members').select('id, display_name').eq('family_id', currentFamily.id),
    ]);
    setItems((data as Investment[]) ?? []);
    setMembers(Object.fromEntries(((mem as FamilyMember[]) ?? []).map((m) => [m.id, m.display_name])));
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this investment?')) return;
    const supabase = createClient();
    await supabase.from('investments').delete().eq('id', id);
    load();
  };

  const active = items.filter((i) => i.is_active);
  const invested = active.reduce((s, i) => s + Number(i.initial_amount), 0);
  const value = active.reduce((s, i) => s + Number(i.current_value), 0);
  const gain = value - invested;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Investments</h1>
          <p className="text-sm text-muted-foreground">{active.length} holding{active.length === 1 ? '' : 's'}</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Add Investment
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No investments tracked. Add DPS, FDR, stocks, mutual funds or gold holdings.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Total Invested" value={formatBDT(invested)} />
            <StatTile label="Current Value" value={formatBDT(value)} tone="income" />
            <StatTile
              label="Gain / Loss"
              value={`${gain >= 0 ? '+' : ''}${formatBDT(gain)}`}
              tone={gain >= 0 ? 'income' : 'danger'}
            />
            <StatTile
              label="Return"
              value={invested > 0 ? `${((gain / invested) * 100).toFixed(1)}%` : '—'}
              tone={gain >= 0 ? 'income' : 'danger'}
            />
          </div>

          <div className="space-y-2">
            {items.map((i) => {
              const g = Number(i.current_value) - Number(i.initial_amount);
              return (
                <Card key={i.id} className={cn(!i.is_active && 'opacity-60')}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-medium">
                        {i.name}
                        <span className="ml-2 text-xs text-muted-foreground">{TYPE_LABEL[i.type] ?? i.type}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Since {formatDate(i.started_on)}
                        {i.owner_member_id && members[i.owner_member_id] ? ` · ${members[i.owner_member_id]}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{formatBDT(i.current_value)}</p>
                        <p className={cn('flex items-center justify-end gap-1 text-xs', g >= 0 ? 'text-income' : 'text-destructive')}>
                          {g >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {g >= 0 ? '+' : ''}{formatBDT(g)}
                        </p>
                      </div>
                      <button onClick={() => { setEditing(i); setFormOpen(true); }} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(i.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <InvestmentDialog open={formOpen} onOpenChange={setFormOpen} onSaved={load} editing={editing} />
    </div>
  );
}
