import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'income' | 'expense' | 'danger';
  className?: string;
}

export function StatTile({ label, value, hint, tone = 'default', className }: Props) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            'mt-1 text-xl font-semibold tabular-nums',
            tone === 'income' && 'text-income',
            tone === 'expense' && 'text-expense',
            tone === 'danger' && 'text-destructive'
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
