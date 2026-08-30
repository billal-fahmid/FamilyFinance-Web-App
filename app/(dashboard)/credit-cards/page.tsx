'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, CreditCard as CardIcon, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCardTile } from '@/components/credit/credit-card-tile';
import { CreditCardFormDialog } from '@/components/credit/credit-card-form-dialog';
import { CcPaymentDialog } from '@/components/credit/cc-payment-dialog';
import { formatBDT, formatDate } from '@/lib/utils';
import { utilization, utilizationTone, daysUntil } from '@/lib/finance';
import type { CreditCard, CreditCardStatement } from '@/types/database';

export default function CreditCardsPage() {
  const { currentFamily } = useFamily();
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [statements, setStatements] = useState<CreditCardStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const [{ data: cardData }, { data: stmtData }] = await Promise.all([
      supabase
        .from('credit_cards')
        .select('*')
        .eq('family_id', currentFamily.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: true }),
      supabase
        .from('credit_card_statements')
        .select('*')
        .eq('family_id', currentFamily.id)
        .in('status', ['unpaid', 'partially_paid', 'overdue'])
        .order('due_date', { ascending: true }),
    ]);
    setCards((cardData as CreditCard[]) ?? []);
    setStatements((stmtData as CreditCardStatement[]) ?? []);
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const totalLimit = cards.reduce((s, c) => s + Number(c.credit_limit), 0);
    const totalOutstanding = cards.reduce((s, c) => s + Number(c.current_outstanding), 0);
    const totalAvailable = cards.reduce((s, c) => s + Number(c.available_credit), 0);
    const totalStatement = cards.reduce((s, c) => s + Number(c.statement_balance), 0);
    const totalMinDue = cards.reduce((s, c) => s + Number(c.minimum_payment), 0);
    const overdue = statements.filter((s) => s.status === 'overdue');
    const util = totalLimit > 0 ? (totalOutstanding / totalLimit) * 100 : 0;
    return { totalLimit, totalOutstanding, totalAvailable, totalStatement, totalMinDue, overdue, util };
  }, [cards, statements]);

  const cardName = (id: string) => {
    const c = cards.find((x) => x.id === id);
    return c ? `${c.provider} ${c.card_name}` : 'Card';
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading credit cards…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Credit Cards</h1>
          <p className="text-sm text-muted-foreground">{cards.length} card{cards.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={cards.length === 0} onClick={() => setPayOpen(true)}>
            Pay Bill
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Add Card
          </Button>
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No credit cards yet. Add one to track outstanding balances, statements, minimum payments and utilization.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Total Credit Limit" value={formatBDT(summary.totalLimit)} />
            <StatTile label="Total Outstanding" value={formatBDT(summary.totalOutstanding)} tone="expense" />
            <StatTile label="Available Credit" value={formatBDT(summary.totalAvailable)} tone="income" />
            <StatTile label="Total Statement Balance" value={formatBDT(summary.totalStatement)} />
            <StatTile label="Total Minimum Due" value={formatBDT(summary.totalMinDue)} />
            <StatTile
              label="Overall Utilization"
              value={`${summary.util.toFixed(0)}%`}
              tone={summary.util >= 80 ? 'danger' : 'default'}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Overall Credit Utilization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress value={summary.util} tone={utilizationTone(summary.util)} className="h-3" />
              <p className="text-xs text-muted-foreground">
                {formatBDT(summary.totalOutstanding)} of {formatBDT(summary.totalLimit)} used
                {summary.util >= 30 && ' — keeping this under 30% helps your credit profile.'}
              </p>
            </CardContent>
          </Card>

          {summary.overdue.length > 0 && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Overdue Cards
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {summary.overdue.map((s) => (
                  <div key={s.id} className="flex justify-between">
                    <span>{cardName(s.card_id)} — due {formatDate(s.due_date)}</span>
                    <span className="font-medium tabular-nums text-destructive">{formatBDT(s.remaining_dues)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Upcoming Due Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {statements.filter((s) => s.status !== 'overdue').length === 0 && (
                <p className="text-muted-foreground">No pending statements.</p>
              )}
              {statements
                .filter((s) => s.status !== 'overdue')
                .map((s) => {
                  const d = daysUntil(s.due_date);
                  return (
                    <div key={s.id} className="flex justify-between">
                      <span>
                        {cardName(s.card_id)} — {formatDate(s.due_date)}{' '}
                        <span className="text-muted-foreground">
                          ({d < 0 ? `${-d}d ago` : d === 0 ? 'today' : `in ${d}d`})
                        </span>
                      </span>
                      <span className="font-medium tabular-nums">{formatBDT(s.remaining_dues)}</span>
                    </div>
                  );
                })}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <CreditCardTile key={c.id} card={c} onEdit={() => { setEditing(c); setFormOpen(true); }} />
            ))}
          </div>
        </>
      )}

      <CreditCardFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={load} editing={editing} />
      <CcPaymentDialog open={payOpen} onOpenChange={setPayOpen} onSaved={load} cards={cards} />
    </div>
  );
}
