'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Card, CardContent } from '@/components/ui/card';
import { BillFormDialog } from '@/components/bills/bill-form-dialog';
import { BillPaymentDialog } from '@/components/bills/bill-payment-dialog';
import { formatBDT, formatDate, cn } from '@/lib/utils';
import { daysUntil } from '@/lib/finance';
import { BILL_CATEGORIES } from '@/lib/validations/bills';
import type { Bill } from '@/types/database';

const CAT_LABEL = Object.fromEntries(BILL_CATEGORIES.map((c) => [c.key, c.label]));

export default function BillsPage() {
  const { currentFamily } = useFamily();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState<Bill | null>(null);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('bills')
      .select('*')
      .eq('family_id', currentFamily.id)
      .order('next_due_date', { ascending: true });
    setBills((data as Bill[]) ?? []);
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this bill and its payment history?')) return;
    const supabase = createClient();
    await supabase.from('bills').delete().eq('id', id);
    load();
  };

  const active = bills.filter((b) => b.is_active);
  const monthlyEquivalent = active.reduce((s, b) => {
    const f = b.frequency;
    const factor = f === 'yearly' ? 1 / 12 : f === 'quarterly' ? 1 / 3 : f === 'weekly' ? 4.33 : f === 'biweekly' ? 2.17 : f === 'daily' ? 30 : 1;
    return s + Number(b.amount) * factor;
  }, 0);
  const dueSoon = active.filter((b) => daysUntil(b.next_due_date) <= 7);
  const overdue = active.filter((b) => daysUntil(b.next_due_date) < 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Bills &amp; Recurring Payments</h1>
          <p className="text-sm text-muted-foreground">{active.length} active</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Add Bill
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : bills.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No bills yet. Add rent, electricity, gas, water, internet, mobile, school fees, insurance, loan EMI,
          credit-card bills or DPS to track due dates and reminders.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Active Bills" value={String(active.length)} />
            <StatTile label="≈ Monthly Total" value={formatBDT(monthlyEquivalent)} tone="expense" />
            <StatTile label="Due in 7 days" value={String(dueSoon.length)} tone={dueSoon.length ? 'danger' : 'default'} />
            <StatTile label="Overdue" value={String(overdue.length)} tone={overdue.length ? 'danger' : 'default'} />
          </div>

          <div className="space-y-2">
            {bills.map((b) => {
              const d = daysUntil(b.next_due_date);
              const tone = d < 0 ? 'text-destructive' : d <= b.reminder_days_before ? 'text-amber-600' : 'text-muted-foreground';
              return (
                <Card key={b.id} className={cn(!b.is_active && 'opacity-60')}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-medium">
                        {b.name}
                        <span className="ml-2 text-xs text-muted-foreground">{CAT_LABEL[b.category_key] ?? b.category_key}</span>
                      </p>
                      <p className={cn('text-xs', tone)}>
                        {b.frequency} · next {formatDate(b.next_due_date)}{' '}
                        ({d < 0 ? `${-d}d overdue` : d === 0 ? 'due today' : `in ${d}d`})
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">{formatBDT(b.amount)}</span>
                      <Button size="sm" variant="outline" onClick={() => { setPaying(b); setPayOpen(true); }}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Pay
                      </Button>
                      <button onClick={() => { setEditing(b); setFormOpen(true); }} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(b.id)} className="text-muted-foreground hover:text-destructive">
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

      <BillFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={load} editing={editing} />
      <BillPaymentDialog open={payOpen} onOpenChange={setPayOpen} onSaved={load} bill={paying} />
    </div>
  );
}
