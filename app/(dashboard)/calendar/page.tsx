'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatBDT, cn, toLocalISODate } from '@/lib/utils';
import { nextDayOfMonth } from '@/lib/finance';

type EvKind = 'income' | 'expense' | 'bill' | 'cc' | 'loan' | 'goal';

interface CalEvent {
  date: string; // yyyy-mm-dd
  kind: EvKind;
  label: string;
  amount?: number;
}

const KIND_STYLE: Record<EvKind, string> = {
  income: 'bg-income/15 text-income',
  expense: 'bg-expense/15 text-expense',
  bill: 'bg-primary/15 text-primary',
  cc: 'bg-amber-500/15 text-amber-600',
  loan: 'bg-purple-500/15 text-purple-600',
  goal: 'bg-sky-500/15 text-sky-600',
};
const KIND_LABEL: Record<EvKind, string> = {
  income: 'Income', expense: 'Expense', bill: 'Bill', cc: 'Card due', loan: 'Loan EMI', goal: 'Goal target',
};

export default function CalendarPage() {
  const { currentFamily } = useFamily();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor]);
  const startISO = toLocalISODate(monthStart);
  const endISO = toLocalISODate(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const fam = currentFamily.id;
    const [inc, exp, bills, cards, loans, goals] = await Promise.all([
      supabase.from('income').select('amount, occurred_on, source, category_key').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', startISO).lt('occurred_on', endISO),
      supabase.from('expenses').select('amount, occurred_on, merchant, category_key').eq('family_id', fam).is('deleted_at', null).gte('occurred_on', startISO).lt('occurred_on', endISO),
      supabase.from('bills').select('name, amount, next_due_date, is_active').eq('family_id', fam),
      supabase.from('credit_cards').select('provider, card_name, due_day, minimum_payment').eq('family_id', fam).eq('is_archived', false),
      supabase.from('loans').select('lender, emi_amount, start_date, is_closed').eq('family_id', fam),
      supabase.from('savings_goals').select('name, target_amount, target_date').eq('family_id', fam),
    ]);

    const ev: CalEvent[] = [];
    const inMonth = (iso: string) => iso >= startISO && iso < endISO;

    (inc.data ?? []).forEach((r: any) => ev.push({ date: r.occurred_on, kind: 'income', label: r.source || r.category_key, amount: Number(r.amount) }));
    (exp.data ?? []).forEach((r: any) => ev.push({ date: r.occurred_on, kind: 'expense', label: r.merchant || r.category_key, amount: Number(r.amount) }));

    (bills.data ?? []).forEach((r: any) => {
      if (r.is_active && inMonth(r.next_due_date)) ev.push({ date: r.next_due_date, kind: 'bill', label: r.name, amount: Number(r.amount) });
    });
    (cards.data ?? []).forEach((r: any) => {
      if (!r.due_day) return;
      const d = toLocalISODate(nextDayOfMonth(r.due_day, monthStart));
      if (inMonth(d)) ev.push({ date: d, kind: 'cc', label: `${r.provider} ${r.card_name} due`, amount: Number(r.minimum_payment) || undefined });
    });
    (loans.data ?? []).forEach((r: any) => {
      if (r.is_closed || !r.emi_amount) return;
      const day = Math.min(new Date(r.start_date + 'T00:00:00').getDate(), 28);
      const d = toLocalISODate(new Date(cursor.getFullYear(), cursor.getMonth(), day));
      if (inMonth(d)) ev.push({ date: d, kind: 'loan', label: `${r.lender} EMI`, amount: Number(r.emi_amount) });
    });
    (goals.data ?? []).forEach((r: any) => {
      if (r.target_date && inMonth(r.target_date)) ev.push({ date: r.target_date, kind: 'goal', label: `${r.name} target`, amount: Number(r.target_amount) });
    });

    setEvents(ev);
    setLoading(false);
  }, [currentFamily, startISO, endISO, monthStart, cursor]);

  useEffect(() => { load(); }, [load]);

  const weeks = useMemo(() => {
    const firstWeekday = monthStart.getDay(); // 0 Sun
    const days: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) days.push(null);
    for (let d = 1; d <= monthEnd.getDate(); d++) days.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (days.length % 7 !== 0) days.push(null);
    const w: (Date | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) w.push(days.slice(i, i + 7));
    return w;
  }, [monthStart, monthEnd, cursor]);

  const eventsOn = (d: Date) => {
    const iso = toLocalISODate(d);
    return events.filter((e) => e.date === iso);
  };
  const todayISO = toLocalISODate(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Financial Calendar</h1>
          <p className="text-sm text-muted-foreground">Income, expenses, bills, card & loan due dates</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium">
            {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {(Object.keys(KIND_LABEL) as EvKind[]).map((k) => (
          <span key={k} className={cn('rounded px-2 py-0.5 font-medium', KIND_STYLE[k])}>{KIND_LABEL[k]}</span>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-3">
          {loading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs font-medium text-muted-foreground">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}
              </div>
              <div className="space-y-1">
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1">
                    {week.map((day, di) => {
                      if (!day) return <div key={di} className="min-h-[92px] rounded-md bg-muted/30" />;
                      const iso = toLocalISODate(day);
                      const evs = eventsOn(day);
                      return (
                        <div
                          key={di}
                          className={cn(
                            'min-h-[92px] rounded-md border p-1 text-xs',
                            iso === todayISO && 'border-primary ring-1 ring-primary'
                          )}
                        >
                          <div className="mb-1 text-right font-medium text-muted-foreground">{day.getDate()}</div>
                          <div className="space-y-0.5">
                            {evs.slice(0, 4).map((e, i) => (
                              <div key={i} className={cn('truncate rounded px-1 py-0.5', KIND_STYLE[e.kind])} title={`${e.label}${e.amount ? ` · ${formatBDT(e.amount)}` : ''}`}>
                                {e.label}
                              </div>
                            ))}
                            {evs.length > 4 && <div className="text-muted-foreground">+{evs.length - 4} more</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
