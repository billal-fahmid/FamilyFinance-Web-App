'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Card, CardContent } from '@/components/ui/card';
import { AssetDialog } from '@/components/wealth/asset-dialog';
import { formatBDT, formatDate, cn } from '@/lib/utils';
import { ASSET_TYPES } from '@/lib/validations/wealth';
import type { Asset, FamilyMember } from '@/types/database';

const TYPE_LABEL = Object.fromEntries(ASSET_TYPES.map((t) => [t.key, t.label]));

export default function AssetsPage() {
  const { currentFamily } = useFamily();
  const [items, setItems] = useState<Asset[]>([]);
  const [members, setMembers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const [{ data }, { data: mem }] = await Promise.all([
      supabase.from('assets').select('*').eq('family_id', currentFamily.id).order('current_value', { ascending: false }),
      supabase.from('family_members').select('id, display_name').eq('family_id', currentFamily.id),
    ]);
    setItems((data as Asset[]) ?? []);
    setMembers(Object.fromEntries(((mem as FamilyMember[]) ?? []).map((m) => [m.id, m.display_name])));
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this asset?')) return;
    const supabase = createClient();
    await supabase.from('assets').delete().eq('id', id);
    load();
  };

  const purchase = items.reduce((s, a) => s + Number(a.purchase_value), 0);
  const current = items.reduce((s, a) => s + Number(a.current_value), 0);
  const change = current - purchase;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Assets</h1>
          <p className="text-sm text-muted-foreground">{items.length} item{items.length === 1 ? '' : 's'}</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Add Asset
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No assets tracked. Add property, land, vehicles, gold or electronics with their current estimated value.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Purchase Value" value={formatBDT(purchase)} />
            <StatTile label="Current Value" value={formatBDT(current)} tone="income" />
            <StatTile
              label="Appreciation"
              value={`${change >= 0 ? '+' : ''}${formatBDT(change)}`}
              tone={change >= 0 ? 'income' : 'danger'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((a) => {
              const d = Number(a.current_value) - Number(a.purchase_value);
              return (
                <Card key={a.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {TYPE_LABEL[a.asset_type] ?? a.asset_type}
                          {a.purchase_date ? ` · bought ${formatDate(a.purchase_date)}` : ''}
                          {a.owner_member_id && members[a.owner_member_id] ? ` · ${members[a.owner_member_id]}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(a); setFormOpen(true); }} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove(a.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div><p className="text-xs text-muted-foreground">Bought for</p><p className="font-medium tabular-nums">{formatBDT(a.purchase_value)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Worth now</p><p className="font-medium tabular-nums">{formatBDT(a.current_value)}</p></div>
                      <div>
                        <p className="text-xs text-muted-foreground">Change</p>
                        <p className={cn('font-medium tabular-nums', d >= 0 ? 'text-income' : 'text-destructive')}>
                          {d >= 0 ? '+' : ''}{formatBDT(d)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <AssetDialog open={formOpen} onOpenChange={setFormOpen} onSaved={load} editing={editing} />
    </div>
  );
}
