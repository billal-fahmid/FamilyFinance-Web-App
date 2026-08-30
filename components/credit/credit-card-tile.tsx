import Link from 'next/link';
import { CreditCard as CardIcon, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatBDT, cn } from '@/lib/utils';
import { utilization, utilizationTone } from '@/lib/finance';
import type { CreditCard } from '@/types/database';

const TONE_TEXT = { ok: 'text-income', warn: 'text-amber-600', danger: 'text-destructive' };

export function CreditCardTile({ card, onEdit }: { card: CreditCard; onEdit?: () => void }) {
  const pct = utilization(card);
  const tone = utilizationTone(pct);

  return (
    <Card className="hover:shadow-md">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <Link href={`/credit-cards/${card.id}`} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CardIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">
                {card.provider} {card.card_name}
              </p>
              <p className="text-xs text-muted-foreground">
                **** {card.last4 ?? '••••'}
              </p>
            </div>
          </Link>
          {onEdit && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="font-semibold tabular-nums text-expense">{formatBDT(card.current_outstanding)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="font-semibold tabular-nums">{formatBDT(card.available_credit)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Limit</p>
            <p className="font-semibold tabular-nums">{formatBDT(card.credit_limit)}</p>
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Utilization</span>
            <span className={cn('font-medium', TONE_TEXT[tone])}>{pct.toFixed(0)}%</span>
          </div>
          <Progress value={pct} tone={tone} />
        </div>

        {(card.minimum_payment > 0 || card.due_day) && (
          <p className="mt-3 text-xs text-muted-foreground">
            {card.minimum_payment > 0 && <>Min due {formatBDT(card.minimum_payment)} · </>}
            {card.due_day && <>Payment due day {card.due_day}</>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
