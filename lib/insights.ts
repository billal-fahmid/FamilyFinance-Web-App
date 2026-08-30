import { formatBDT } from '@/lib/utils';

export interface Insight {
  id: string;
  tone: 'positive' | 'neutral' | 'warning';
  text: string;
}

export interface InsightInput {
  income: { current: number; previous: number };
  expense: { current: number; previous: number };
  byCategory: { current: Record<string, number>; previous: Record<string, number> };
  categoryLabels: Record<string, string>;
  savingsRate: number | null; // 0-1
  budget: { limit: number; spent: number } | null;
  creditUtilization: number | null; // 0-100
  netWorthChange: { amount: number; months: number } | null;
}

const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100);

/**
 * Rule-based observations about the family's finances. These are descriptive
 * summaries of the numbers, NOT professional financial advice.
 */
export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];

  // Overall spend movement
  const spendChange = pct(i.expense.current, i.expense.previous);
  if (i.expense.previous > 0 && Math.abs(spendChange) >= 8) {
    out.push({
      id: 'spend-trend',
      tone: spendChange > 0 ? 'warning' : 'positive',
      text:
        spendChange > 0
          ? `Total spending is up ${spendChange.toFixed(0)}% versus last month (${formatBDT(
              i.expense.current - i.expense.previous
            )} more).`
          : `Total spending is down ${Math.abs(spendChange).toFixed(0)}% versus last month (${formatBDT(
              i.expense.previous - i.expense.current
            )} less).`,
    });
  }

  // Category movers
  const catDeltas = Object.keys({ ...i.byCategory.current, ...i.byCategory.previous })
    .map((key) => {
      const cur = i.byCategory.current[key] ?? 0;
      const prev = i.byCategory.previous[key] ?? 0;
      return { key, cur, prev, delta: cur - prev, change: pct(cur, prev) };
    })
    .filter((d) => d.prev >= 500 && Math.abs(d.delta) >= 500)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  for (const d of catDeltas) {
    const label = i.categoryLabels[d.key] ?? d.key;
    if (d.delta > 0) {
      out.push({
        id: `cat-${d.key}`,
        tone: 'warning',
        text: `${label} spending increased ${d.change.toFixed(0)}% compared with last month — ${formatBDT(
          d.delta
        )} more.`,
      });
    } else {
      out.push({
        id: `cat-${d.key}`,
        tone: 'positive',
        text: `${label} spending fell ${Math.abs(d.change).toFixed(0)}% — ${formatBDT(-d.delta)} less than last month.`,
      });
    }
  }

  // Savings rate
  if (i.savingsRate !== null) {
    const rate = Math.round(i.savingsRate * 100);
    out.push({
      id: 'savings-rate',
      tone: rate >= 20 ? 'positive' : rate >= 0 ? 'neutral' : 'warning',
      text:
        rate >= 0
          ? `Your savings rate this month is ${rate}% of income.`
          : `You spent more than you earned this month (savings rate ${rate}%).`,
    });
  }

  // Budget
  if (i.budget && i.budget.limit > 0) {
    const used = (i.budget.spent / i.budget.limit) * 100;
    if (used >= 100) {
      out.push({
        id: 'budget',
        tone: 'warning',
        text: `Monthly expenses exceeded your budget — ${formatBDT(i.budget.spent)} spent of ${formatBDT(
          i.budget.limit
        )}.`,
      });
    } else if (used >= 85) {
      out.push({
        id: 'budget',
        tone: 'warning',
        text: `You've used ${used.toFixed(0)}% of your monthly budget.`,
      });
    } else {
      out.push({
        id: 'budget',
        tone: 'positive',
        text: `Budget on track — ${used.toFixed(0)}% used with ${formatBDT(i.budget.limit - i.budget.spent)} left.`,
      });
    }
  }

  // Credit utilization
  if (i.creditUtilization !== null && i.creditUtilization > 0) {
    out.push({
      id: 'cc-util',
      tone: i.creditUtilization >= 50 ? 'warning' : 'neutral',
      text:
        i.creditUtilization >= 50
          ? `Your credit-card utilization is high at ${i.creditUtilization.toFixed(0)}%.`
          : `Your credit-card utilization is ${i.creditUtilization.toFixed(0)}%.`,
    });
  }

  // Net worth
  if (i.netWorthChange && i.netWorthChange.months >= 1) {
    const { amount, months } = i.netWorthChange;
    out.push({
      id: 'net-worth',
      tone: amount >= 0 ? 'positive' : 'warning',
      text:
        amount >= 0
          ? `Net worth grew ${formatBDT(amount)} over the last ${months} month${months > 1 ? 's' : ''}.`
          : `Net worth fell ${formatBDT(-amount)} over the last ${months} month${months > 1 ? 's' : ''}.`,
    });
  }

  if (out.length === 0) {
    out.push({
      id: 'none',
      tone: 'neutral',
      text: 'Not enough history yet — add a few weeks of transactions to see trends here.',
    });
  }

  return out;
}
