import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { formatBDT } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  amount: number;
  tone?: 'default' | 'income' | 'expense';
}

export function StatCard({ label, amount, tone = 'default' }: Props) {
  return (
    <Card>
      <CardContent className="pt-6">
        <CardTitle>{label}</CardTitle>
        <p
          className={cn(
            'mt-2 text-2xl font-semibold tabular-nums',
            tone === 'income' && 'text-income',
            tone === 'expense' && 'text-expense'
          )}
        >
          {formatBDT(amount)}
        </p>
      </CardContent>
    </Card>
  );
}
