'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, PartyPopper } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { EventDialog } from '@/components/events/event-dialog';
import { formatBDT, formatDate } from '@/lib/utils';
import { FAMILY_EVENT_TYPES } from '@/lib/validations/wealth';
import type { FamilyEvent } from '@/types/database';

const TYPE_LABEL = Object.fromEntries(FAMILY_EVENT_TYPES.map((t) => [t.key, t.label]));

export default function EventsPage() {
  const { currentFamily } = useFamily();
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [spentByEvent, setSpentByEvent] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FamilyEvent | null>(null);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const [{ data: ev }, { data: exp }] = await Promise.all([
      supabase.from('family_events').select('*').eq('family_id', currentFamily.id).order('event_date', { ascending: true, nullsFirst: false }),
      supabase.from('expenses').select('event_id, amount').eq('family_id', currentFamily.id).not('event_id', 'is', null),
    ]);
    setEvents((ev as FamilyEvent[]) ?? []);
    const totals: Record<string, number> = {};
    ((exp as any[]) ?? []).forEach((r) => {
      totals[r.event_id] = (totals[r.event_id] ?? 0) + Number(r.amount);
    });
    setSpentByEvent(totals);
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this event? Tagged expenses stay but lose the tag.')) return;
    const supabase = createClient();
    await supabase.from('family_events').delete().eq('id', id);
    load();
  };

  const totalBudget = events.reduce((s, e) => s + Number(e.budget_amount), 0);
  const totalSpent = events.reduce((s, e) => s + (spentByEvent[e.id] ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Family Events</h1>
          <p className="text-sm text-muted-foreground">Budgets for Eid, weddings, vacations & more</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> New Event
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : events.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No events yet. Create an Eid, Ramadan, wedding or vacation budget, then tag expenses to it.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Total Event Budgets" value={formatBDT(totalBudget)} />
            <StatTile label="Spent" value={formatBDT(totalSpent)} tone="expense" />
            <StatTile label="Remaining" value={formatBDT(totalBudget - totalSpent)} tone={totalBudget - totalSpent < 0 ? 'danger' : 'income'} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {events.map((e) => {
              const spent = spentByEvent[e.id] ?? 0;
              const pct = e.budget_amount > 0 ? (spent / e.budget_amount) * 100 : 0;
              return (
                <Card key={e.id} className="hover:shadow-md">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <PartyPopper className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-medium">{e.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {TYPE_LABEL[e.event_type] ?? e.event_type}
                            {e.event_date ? ` · ${formatDate(e.event_date)}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(e); setOpen(true); }} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove(e.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-end justify-between text-sm">
                      <span className="text-lg font-semibold tabular-nums">{formatBDT(spent)}</span>
                      <span className="text-muted-foreground">of {formatBDT(e.budget_amount)}</span>
                    </div>
                    <Progress
                      value={pct}
                      tone={pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : 'primary'}
                      className="mt-2 h-2.5"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {e.budget_amount - spent >= 0
                        ? `${formatBDT(e.budget_amount - spent)} remaining`
                        : `${formatBDT(spent - e.budget_amount)} over budget`}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <EventDialog open={open} onOpenChange={setOpen} onSaved={load} editing={editing} />
    </div>
  );
}
