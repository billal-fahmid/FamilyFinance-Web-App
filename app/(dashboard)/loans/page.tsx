'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, Landmark, Users, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { LoanFormDialog } from '@/components/loans/loan-form-dialog';
import { LoanPaymentDialog } from '@/components/loans/loan-payment-dialog';
import { formatBDT, formatDate, cn } from '@/lib/utils';
import { monthStartISO } from '@/lib/finance';
import { LOAN_TYPES } from '@/lib/validations/loans';
import type { Loan, LoanPayment } from '@/types/database';

const TYPE_LABEL = Object.fromEntries(LOAN_TYPES.map((t) => [t.key, t.label]));

export default function LoansPage() {
  const { currentFamily } = useFamily();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Record<string, LoanPayment[]>>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [newLoanSource, setNewLoanSource] = useState<'bank' | 'person'>('bank');
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState<Loan | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
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

  const nextMonth = useMemo(() => {
    const d = new Date(month + 'T00:00:00');
    d.setMonth(d.getMonth() + 1);
    return monthStartISO(d);
  }, [month]);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    setLoading(true);
    const supabase = createClient();
    const [{ data: loanData }, { data: payData }] = await Promise.all([
      supabase.from('loans').select('*').eq('family_id', currentFamily.id).order('created_at', { ascending: true }),
      supabase.from('loan_payments').select('*').eq('family_id', currentFamily.id).order('paid_on', { ascending: false }),
    ]);
    setLoans((loanData as Loan[]) ?? []);
    const grouped: Record<string, LoanPayment[]> = {};
    ((payData as LoanPayment[]) ?? []).forEach((p) => {
      (grouped[p.loan_id] ??= []).push(p);
    });
    setPayments(grouped);
    setLoading(false);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this loan and its payment history?')) return;
    const supabase = createClient();
    await supabase.from('loans').delete().eq('id', id);
    load();
  };

  const deletePayment = async (id: string) => {
    if (!confirm('Delete this payment? Balances will be restored.')) return;
    const supabase = createClient();
    await supabase.from('loan_payments').delete().eq('id', id);
    load();
  };

  const activeLoans = loans.filter((l) => !l.is_closed);
  const totalOutstanding = activeLoans.reduce((s, l) => s + Number(l.outstanding_balance), 0);
  const totalPrincipal = activeLoans.reduce((s, l) => s + Number(l.principal), 0);
  const totalEmi = activeLoans.reduce((s, l) => s + Number(l.emi_amount), 0);

  // Payments that landed within the selected month, per loan — drives the
  // monthly EMI-tracking checklist below without a separate fetch.
  const inMonth = (iso: string) => iso >= month && iso < nextMonth;
  const monthlyPaidByLoan: Record<string, number> = {};
  Object.entries(payments).forEach(([loanId, list]) => {
    monthlyPaidByLoan[loanId] = list.filter((p) => inMonth(p.paid_on)).reduce((s, p) => s + Number(p.amount), 0);
  });
  const totalPaidThisMonth = Object.values(monthlyPaidByLoan).reduce((s, v) => s + v, 0);
  const isCurrentOrPastMonth = monthOffset <= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Loans &amp; Debt</h1>
          <p className="text-sm text-muted-foreground">{activeLoans.length} active</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditing(null); setNewLoanSource('bank'); setFormOpen(true); }}
          >
            <Landmark className="mr-1 h-4 w-4" /> Loan from Bank/Card
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditing(null); setNewLoanSource('person'); setFormOpen(true); }}
          >
            <Users className="mr-1 h-4 w-4" /> Loan from Person
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{monthLabel}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((o) => o - 1)}>←</Button>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset(0)} disabled={monthOffset === 0}>This month</Button>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((o) => o + 1)}>→</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : loans.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No loans yet. Track personal, home, car, or family loans — principal, EMI, outstanding balance and payment history.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Total Outstanding" value={formatBDT(totalOutstanding)} tone="expense" />
            <StatTile label="Total Borrowed" value={formatBDT(totalPrincipal)} />
            <StatTile label="Monthly EMI" value={formatBDT(totalEmi)} />
            <StatTile label={`Paid — ${monthLabel}`} value={formatBDT(totalPaidThisMonth)} tone="income" />
            <StatTile label="Repaid (all time)" value={formatBDT(Math.max(totalPrincipal - totalOutstanding, 0))} tone="income" />
          </div>

          <div className="space-y-3">
            {loans.map((l) => {
              const repaidPct = l.principal > 0 ? ((l.principal - l.outstanding_balance) / l.principal) * 100 : 0;
              const list = payments[l.id] ?? [];
              const monthPaid = monthlyPaidByLoan[l.id] ?? 0;
              return (
                <Card key={l.id} className={cn(l.is_closed && 'border-income/40')}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="flex items-center gap-1.5 font-medium">
                          {l.type === 'family' ? (
                            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <Landmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          {l.lender}
                          <span className="text-xs text-muted-foreground">{TYPE_LABEL[l.type]}</span>
                          {l.is_closed && (
                            <span className="flex items-center gap-1 rounded bg-income/15 px-1.5 py-0.5 text-xs font-medium text-income">
                              <CheckCircle2 className="h-3 w-3" /> Paid off
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(l.start_date)}{l.end_date ? ` – ${formatDate(l.end_date)}` : ''}
                          {l.interest_rate ? ` · ${l.interest_rate}%` : ''}
                          {l.emi_amount ? ` · EMI ${formatBDT(l.emi_amount)}` : ''}
                        </p>
                        {!l.is_closed && (
                          <p
                            className={cn(
                              'mt-1 flex items-center gap-1 text-xs font-medium',
                              monthPaid > 0 ? 'text-income' : isCurrentOrPastMonth ? 'text-amber-600' : 'text-muted-foreground'
                            )}
                          >
                            {monthPaid > 0 ? (
                              <>
                                <CheckCircle2 className="h-3 w-3" /> Paid {formatBDT(monthPaid)} in {monthLabel}
                              </>
                            ) : isCurrentOrPastMonth ? (
                              `No payment recorded in ${monthLabel}`
                            ) : (
                              `Nothing paid yet for ${monthLabel}`
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={l.is_closed}
                          onClick={() => { setPaying(l); setPayOpen(true); }}
                        >
                          {l.is_closed ? 'Paid' : 'Pay'}
                        </Button>
                        <button onClick={() => { setEditing(l); setFormOpen(true); }} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove(l.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div><p className="text-xs text-muted-foreground">Principal</p><p className="font-medium tabular-nums">{formatBDT(l.principal)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-medium tabular-nums text-expense">{formatBDT(l.outstanding_balance)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Repaid</p><p className="font-medium tabular-nums text-income">{formatBDT(l.principal - l.outstanding_balance)}</p></div>
                    </div>
                    <Progress value={repaidPct} tone="primary" className="mt-2" />

                    <button
                      onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                      className="mt-3 text-xs text-primary hover:underline"
                    >
                      {expanded === l.id ? 'Hide' : 'Show'} payment history ({list.length})
                    </button>
                    {expanded === l.id && (
                      <div className="mt-2 divide-y rounded-md border">
                        {list.length === 0 && <p className="p-3 text-xs text-muted-foreground">No payments yet.</p>}
                        {list.map((p) => (
                          <div key={p.id} className="flex items-center justify-between p-3 text-sm">
                            <span className="text-muted-foreground">
                              {formatDate(p.paid_on)}
                              {p.principal_component != null && ` · principal ${formatBDT(p.principal_component)}`}
                              {p.interest_component != null && ` · interest ${formatBDT(p.interest_component)}`}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="font-medium tabular-nums">{formatBDT(p.amount)}</span>
                              <button onClick={() => deletePayment(p.id)} className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <LoanFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={load}
        editing={editing}
        initialSource={newLoanSource}
      />
      <LoanPaymentDialog open={payOpen} onOpenChange={setPayOpen} onSaved={load} loan={paying} />
    </div>
  );
}
