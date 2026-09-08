import type { CreditCard, CreditCardTxnType, StatementStatus, RecurringFrequency } from '@/types/database';
import { toLocalISODate } from '@/lib/utils';

/** Credit utilization = outstanding / limit * 100 (clamped at 0). */
export function utilization(card: Pick<CreditCard, 'credit_limit' | 'current_outstanding'>): number {
  if (!card.credit_limit || card.credit_limit <= 0) return 0;
  return Math.max(0, (Number(card.current_outstanding) / Number(card.credit_limit)) * 100);
}

/** Tailwind tone for a utilization percentage. */
export function utilizationTone(pct: number): 'ok' | 'warn' | 'danger' {
  if (pct >= 80) return 'danger';
  if (pct >= 50) return 'warn';
  return 'ok';
}

/** Next occurrence of a day-of-month, on or after `from`. */
export function nextDayOfMonth(day: number, from = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), day);
  if (d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

export function advanceDate(iso: string, freq: RecurringFrequency): string {
  const d = new Date(iso + 'T00:00:00');
  switch (freq) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  return toLocalISODate(d);
}

export function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00').getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

export const CC_TXN_LABELS: Record<CreditCardTxnType, string> = {
  purchase: 'Purchase',
  online_purchase: 'Online purchase',
  pos_purchase: 'POS purchase',
  cash_advance: 'Cash advance',
  fee: 'Fee',
  interest: 'Interest',
  refund: 'Refund',
  emi_purchase: 'EMI purchase',
  adjustment: 'Adjustment',
};

/** Refund / adjustment reduce outstanding; everything else increases it. */
export function ccTxnSign(type: CreditCardTxnType): 1 | -1 {
  return type === 'refund' || type === 'adjustment' ? -1 : 1;
}

export const STATEMENT_STATUS_LABELS: Record<StatementStatus, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
};

export function statementStatusTone(s: StatementStatus): 'ok' | 'warn' | 'danger' | 'muted' {
  switch (s) {
    case 'paid': return 'ok';
    case 'partially_paid': return 'warn';
    case 'overdue': return 'danger';
    default: return 'muted';
  }
}

/** First day of the current month as an ISO date string. */
export function monthStartISO(d = new Date()): string {
  return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Whole months from today until an ISO date (min 1). */
export function monthsUntil(iso: string | null): number {
  if (!iso) return 0;
  const target = new Date(iso + 'T00:00:00');
  const now = new Date();
  const months =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return Math.max(months, 0);
}

/** Monthly amount needed to reach a savings goal by its target date. */
export function requiredMonthly(target: number, current: number, targetDateISO: string | null): number | null {
  const remaining = Math.max(target - current, 0);
  if (remaining === 0) return 0;
  const m = monthsUntil(targetDateISO);
  if (!targetDateISO || m <= 0) return null;
  return remaining / m;
}

/** Client-side mirror of the SQL statement-status rule. */
export function deriveStatementStatus(
  amountPaid: number,
  statementBalance: number,
  dueDateISO: string
): StatementStatus {
  if (amountPaid >= statementBalance) return 'paid';
  if (daysUntil(dueDateISO) < 0) return 'overdue';
  if (amountPaid > 0) return 'partially_paid';
  return 'unpaid';
}
