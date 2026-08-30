import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBDT, formatDate, cn } from '@/lib/utils';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export interface TxnRow {
  id: string;
  type: 'income' | 'expense';
  label: string;
  amount: number;
  date: string;
}

export function RecentTransactions({ rows }: { rows: TxnRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet</p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent/50">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full',
                  r.type === 'income' ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'
                )}
              >
                {r.type === 'income' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground">{formatDate(r.date)}</p>
              </div>
            </div>
            <span className={cn('text-sm font-semibold tabular-nums', r.type === 'income' ? 'text-income' : 'text-expense')}>
              {r.type === 'income' ? '+' : '-'}
              {formatBDT(r.amount)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
