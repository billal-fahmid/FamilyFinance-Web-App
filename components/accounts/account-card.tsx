import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatBDT, cn } from '@/lib/utils';
import { Pencil, Wallet, Landmark, Smartphone, CreditCard, PiggyBank } from 'lucide-react';
import type { Account } from '@/types/database';

const ICONS: Record<Account['type'], typeof Wallet> = {
  cash: Wallet,
  bank: Landmark,
  bkash: Smartphone,
  nagad: Smartphone,
  rocket: Smartphone,
  debit_card: CreditCard,
  savings: PiggyBank,
  other: Wallet,
};

const LABELS: Record<Account['type'], string> = {
  cash: 'Cash',
  bank: 'Bank Account',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  debit_card: 'Debit Card',
  savings: 'Savings',
  other: 'Other',
};

export function AccountCard({ account, onEdit }: { account: Account; onEdit: () => void }) {
  const Icon = ICONS[account.type];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">{account.name}</p>
              <p className="text-xs text-muted-foreground">
                {LABELS[account.type]}
                {account.masked_number ? ` · ${account.masked_number}` : ''}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p
          className={cn(
            'mt-4 text-xl font-semibold tabular-nums',
            account.current_balance < 0 && 'text-destructive'
          )}
        >
          {formatBDT(account.current_balance)}
        </p>
      </CardContent>
    </Card>
  );
}
