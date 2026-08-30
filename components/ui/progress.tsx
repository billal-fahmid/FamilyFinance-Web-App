import { cn } from '@/lib/utils';

type Tone = 'ok' | 'warn' | 'danger' | 'muted' | 'primary';

const BAR: Record<Tone, string> = {
  ok: 'bg-income',
  warn: 'bg-amber-500',
  danger: 'bg-destructive',
  muted: 'bg-muted-foreground/40',
  primary: 'bg-primary',
};

export function Progress({
  value,
  tone = 'primary',
  className,
}: {
  value: number; // 0 - 100
  tone?: Tone;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full transition-all', BAR[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
