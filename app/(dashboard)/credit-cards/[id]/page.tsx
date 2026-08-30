'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/stat-tile';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CreditCardFormDialog } from '@/components/credit/credit-card-form-dialog';
import { CcTransactionDialog } from '@/components/credit/cc-transaction-dialog';
import { CcStatementDialog } from '@/components/credit/cc-statement-dialog';
import { CcPaymentDialog } from '@/components/credit/cc-payment-dialog';
import { CcEmiDialog } from '@/components/credit/cc-emi-dialog';
import { formatBDT, formatDate, cn } from '@/lib/utils';
import {
  utilization,
  utilizationTone,
  CC_TXN_LABELS,
  ccTxnSign,
  STATEMENT_STATUS_LABELS,
  statementStatusTone,
} from '@/lib/finance';
import type {
  CreditCard,
  CreditCardTransaction,
  CreditCardStatement,
  CreditCardPayment,
  CreditCardEmi,
} from '@/types/database';

const STATUS_CLASS: Record<string, string> = {
  ok: 'bg-income/15 text-income',
  warn: 'bg-amber-500/15 text-amber-600',
  danger: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

export default function CreditCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentFamily } = useFamily();

  const [card, setCard] = useState<CreditCard | null>(null);
  const [txns, setTxns] = useState<CreditCardTransaction[]>([]);
  const [statements, setStatements] = useState<CreditCardStatement[]>([]);
  const [payments, setPayments] = useState<CreditCardPayment[]>([]);
  const [emis, setEmis] = useState<CreditCardEmi[]>([]);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<CreditCardTransaction | null>(null);
  const [stmtOpen, setStmtOpen] = useState(false);
  const [editingStmt, setEditingStmt] = useState<CreditCardStatement | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [emiOpen, setEmiOpen] = useState(false);

  const load = useCallback(async () => {
    if (!currentFamily || !id) return;
    setLoading(true);
    const supabase = createClient();
    const [c, t, s, p, e, accs] = await Promise.all([
      supabase.from('credit_cards').select('*').eq('id', id).single(),
      supabase.from('credit_card_transactions').select('*').eq('card_id', id).order('occurred_on', { ascending: false }),
      supabase.from('credit_card_statements').select('*').eq('card_id', id).order('statement_date', { ascending: false }),
      supabase.from('credit_card_payments').select('*').eq('card_id', id).order('occurred_on', { ascending: false }),
      supabase.from('credit_card_emi').select('*').eq('card_id', id).order('start_date', { ascending: false }),
      supabase.from('accounts').select('id, name').eq('family_id', currentFamily.id),
    ]);
    setCard((c.data as CreditCard) ?? null);
    setTxns((t.data as CreditCardTransaction[]) ?? []);
    setStatements((s.data as CreditCardStatement[]) ?? []);
    setPayments((p.data as CreditCardPayment[]) ?? []);
    setEmis((e.data as CreditCardEmi[]) ?? []);
    setAccountNames(Object.fromEntries(((accs.data as any[]) ?? []).map((a) => [a.id, a.name])));
    setLoading(false);
  }, [currentFamily, id]);

  useEffect(() => {
    load();
  }, [load]);

  const deleteTxn = async (txnId: string) => {
    if (!confirm('Delete this transaction? The card outstanding will be adjusted back.')) return;
    const supabase = createClient();
    await supabase.from('credit_card_transactions').delete().eq('id', txnId);
    load();
  };

  const deletePayment = async (payId: string) => {
    if (!confirm('Delete this payment? The account and card balances will be restored.')) return;
    const supabase = createClient();
    await supabase.from('credit_card_payments').delete().eq('id', payId);
    load();
  };

  const recordInstallment = async (emi: CreditCardEmi) => {
    if (emi.installments_paid >= emi.tenure_months) return;
    const supabase = createClient();
    await supabase
      .from('credit_card_emi')
      .update({ installments_paid: emi.installments_paid + 1 })
      .eq('id', emi.id);
    load();
  };

  const archiveCard = async () => {
    if (!card || !confirm('Archive this card? It will be hidden from the list.')) return;
    const supabase = createClient();
    await supabase.from('credit_cards').update({ is_archived: true }).eq('id', card.id);
    router.push('/credit-cards');
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!card) return <p className="p-6 text-sm text-muted-foreground">Card not found.</p>;

  const pct = utilization(card);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/credit-cards" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Credit Cards
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={archiveCard}>Archive</Button>
        </div>
      </div>

      <div>
        <h1 className="text-xl font-semibold">
          {card.provider} {card.card_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          **** {card.last4 ?? '••••'}
          {card.interest_rate ? ` · ${card.interest_rate}% APR` : ''}
          {card.annual_fee ? ` · annual fee ${formatBDT(card.annual_fee)}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Outstanding" value={formatBDT(card.current_outstanding)} tone="expense" />
        <StatTile label="Available Credit" value={formatBDT(card.available_credit)} tone="income" />
        <StatTile label="Credit Limit" value={formatBDT(card.credit_limit)} />
        <StatTile label="Statement Balance" value={formatBDT(card.statement_balance)} hint={`Min due ${formatBDT(card.minimum_payment)}`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-foreground">Credit Utilization</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {formatBDT(card.current_outstanding)} / {formatBDT(card.credit_limit)}
            </span>
            <span className="font-medium">{pct.toFixed(1)}%</span>
          </div>
          <Progress value={pct} tone={utilizationTone(pct)} className="h-3" />
        </CardContent>
      </Card>

      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="emi">EMI</TabsTrigger>
        </TabsList>

        {/* Transactions */}
        <TabsContent value="transactions" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setEditingTxn(null); setTxnOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Add Transaction
            </Button>
          </div>
          {txns.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No transactions yet.
            </p>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {txns.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{t.merchant || CC_TXN_LABELS[t.type]}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(t.occurred_on)} · {CC_TXN_LABELS[t.type]}
                        {t.category_key ? ` · ${t.category_key}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn('font-medium tabular-nums', ccTxnSign(t.type) < 0 ? 'text-income' : 'text-expense')}>
                        {ccTxnSign(t.type) < 0 ? '−' : '+'}{formatBDT(t.amount)}
                      </span>
                      <button onClick={() => { setEditingTxn(t); setTxnOpen(true); }} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteTxn(t.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Statements */}
        <TabsContent value="statements" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setEditingStmt(null); setStmtOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> New Statement
            </Button>
          </div>
          {statements.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No statements yet. Create one at the end of a billing cycle.
            </p>
          ) : (
            statements.map((s) => (
              <Card key={s.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">
                        Statement {formatDate(s.statement_date)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(s.period_start)} – {formatDate(s.period_end)} · due {formatDate(s.due_date)}
                      </p>
                    </div>
                    <span className={cn('rounded px-2 py-0.5 text-xs font-medium', STATUS_CLASS[statementStatusTone(s.status)])}>
                      {STATEMENT_STATUS_LABELS[s.status]}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Statement</p><p className="font-medium tabular-nums">{formatBDT(s.statement_balance)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Minimum</p><p className="font-medium tabular-nums">{formatBDT(s.minimum_payment)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Paid</p><p className="font-medium tabular-nums text-income">{formatBDT(s.amount_paid)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Remaining</p><p className="font-medium tabular-nums text-expense">{formatBDT(s.remaining_dues)}</p></div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {s.status !== 'paid' && (
                      <Button size="sm" onClick={() => { setPayOpen(true); setEditingStmt(s); }}>
                        Pay {formatBDT(s.remaining_dues)}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { setEditingStmt(s); setStmtOpen(true); }}>
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setEditingStmt(null); setPayOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Record Payment
            </Button>
          </div>
          {payments.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No payments recorded.
            </p>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{accountNames[p.from_account_id] ?? 'Account'} → this card</p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.occurred_on)}{p.notes ? ` · ${p.notes}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium tabular-nums text-income">{formatBDT(p.amount)}</span>
                      <button onClick={() => deletePayment(p.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* EMI */}
        <TabsContent value="emi" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setEmiOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New EMI
            </Button>
          </div>
          {emis.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No EMI purchases on this card.
            </p>
          ) : (
            emis.map((e) => {
              const remainingInstallments = e.tenure_months - e.installments_paid;
              const remainingAmount = remainingInstallments * Number(e.monthly_installment);
              const progressPct = (e.installments_paid / e.tenure_months) * 100;
              return (
                <Card key={e.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{e.product}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(e.start_date)}
                          {e.end_date ? ` – ${formatDate(e.end_date)}` : ''} · {e.interest_rate}% interest
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {e.installments_paid}/{e.tenure_months} paid
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <div><p className="text-xs text-muted-foreground">Original</p><p className="font-medium tabular-nums">{formatBDT(e.original_amount)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Down payment</p><p className="font-medium tabular-nums">{formatBDT(e.down_payment)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Monthly</p><p className="font-medium tabular-nums">{formatBDT(e.monthly_installment)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Remaining</p><p className="font-medium tabular-nums text-expense">{formatBDT(remainingAmount)}</p></div>
                    </div>
                    <div className="mt-3"><Progress value={progressPct} tone="primary" /></div>
                    {remainingInstallments > 0 && (
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => recordInstallment(e)}>
                        Record installment ({remainingInstallments} left)
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      <CreditCardFormDialog open={editOpen} onOpenChange={setEditOpen} onSaved={load} editing={card} />
      <CcTransactionDialog open={txnOpen} onOpenChange={setTxnOpen} onSaved={load} cardId={card.id} editing={editingTxn} />
      <CcStatementDialog open={stmtOpen} onOpenChange={setStmtOpen} onSaved={load} card={card} editing={editingStmt} />
      <CcPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        onSaved={load}
        cards={[card]}
        defaultCardId={card.id}
        defaultStatementId={editingStmt?.id}
        defaultAmount={editingStmt?.remaining_dues}
      />
      <CcEmiDialog open={emiOpen} onOpenChange={setEmiOpen} onSaved={load} cardId={card.id} />
    </div>
  );
}
