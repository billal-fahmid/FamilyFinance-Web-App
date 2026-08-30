'use client';

import { useCallback, useEffect, useState } from 'react';
import { Undo2, Trash2, RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import { formatBDT, formatDate } from '@/lib/utils';
import { useT } from '@/components/providers/locale-provider';
import { friendlyError } from '@/lib/errors';

type Kind = 'expenses' | 'income' | 'transfers';
interface Row {
  kind: Kind;
  id: string;
  amount: number;
  label: string;
  occurred_on: string;
  deleted_at: string;
}

const RETENTION_DAYS = 30;

export default function TrashPage() {
  const { currentFamily } = useFamily();
  const t = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const fam = currentFamily.id;
    const [exp, inc, trf] = await Promise.all([
      supabase.from('expenses').select('id, amount, occurred_on, merchant, category_key, deleted_at').eq('family_id', fam).not('deleted_at', 'is', null),
      supabase.from('income').select('id, amount, occurred_on, source, category_key, deleted_at').eq('family_id', fam).not('deleted_at', 'is', null),
      supabase.from('transfers').select('id, amount, occurred_on, notes, deleted_at').eq('family_id', fam).not('deleted_at', 'is', null),
    ]);
    const out: Row[] = [
      ...((exp.data as any[]) ?? []).map((r) => ({ kind: 'expenses' as const, id: r.id, amount: Number(r.amount), label: r.merchant || r.category_key, occurred_on: r.occurred_on, deleted_at: r.deleted_at })),
      ...((inc.data as any[]) ?? []).map((r) => ({ kind: 'income' as const, id: r.id, amount: Number(r.amount), label: r.source || r.category_key, occurred_on: r.occurred_on, deleted_at: r.deleted_at })),
      ...((trf.data as any[]) ?? []).map((r) => ({ kind: 'transfers' as const, id: r.id, amount: Number(r.amount), label: r.notes || 'Transfer', occurred_on: r.occurred_on, deleted_at: r.deleted_at })),
    ].sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
    setRows(out);
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => { load(); }, [load]);

  const restore = async (r: Row) => {
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.from(r.kind).update({ deleted_at: null, deleted_by: null }).eq('id', r.id);
    if (e) return setError(friendlyError(e));
    load();
  };

  const purgeNow = async (r: Row) => {
    if (!confirm('Permanently delete this? This cannot be undone.')) return;
    const supabase = createClient();
    const { error: e } = await supabase.from(r.kind).delete().eq('id', r.id);
    if (e) return setError(friendlyError(e));
    load();
  };

  const emptyExpired = async () => {
    if (!currentFamily) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.rpc('purge_trash', { fam: currentFamily.id, older_than_days: RETENTION_DAYS });
    await load();
    setBusy(false);
  };

  const daysLeft = (deletedAt: string) => {
    const gone = new Date(deletedAt).getTime() + RETENTION_DAYS * 86_400_000;
    return Math.max(0, Math.ceil((gone - Date.now()) / 86_400_000));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('nav.trash')}</h1>
          <p className="text-sm text-muted-foreground">
            Deleted transactions are kept for {RETENTION_DAYS} days, then removed automatically.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={emptyExpired} disabled={busy || rows.length === 0}>
          <RotateCcw className="mr-1 h-4 w-4" /> Purge expired
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t('empty.trash')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="In trash" value={String(rows.length)} />
            <StatTile label="Expenses" value={String(rows.filter((r) => r.kind === 'expenses').length)} />
            <StatTile label="Income" value={String(rows.filter((r) => r.kind === 'income').length)} />
          </div>
          <Card>
            <CardContent className="divide-y p-0">
              {rows.map((r) => (
                <div key={`${r.kind}-${r.id}`} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium capitalize">
                      {r.label} <span className="text-xs font-normal text-muted-foreground">· {r.kind.replace(/s$/, '')}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBDT(r.amount)} · {formatDate(r.occurred_on)} · deleted {formatDate(r.deleted_at)} · {daysLeft(r.deleted_at)}d left
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => restore(r)}>
                      <Undo2 className="mr-1 h-3.5 w-3.5" /> {t('action.restore')}
                    </Button>
                    <button onClick={() => purgeNow(r)} className="text-muted-foreground hover:text-destructive" aria-label="Delete permanently">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
