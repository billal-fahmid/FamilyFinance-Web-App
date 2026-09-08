'use client';

import type { ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ReceiptManager } from '@/components/receipts/receipt-manager';
import { formatBDT, formatDate, cn } from '@/lib/utils';
import type { ExpenseEntry, IncomeEntry } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'expense' | 'income';
  entry: ExpenseEntry | IncomeEntry | null;
  categoryLabel: string;
  accountName?: string;
  personName?: string;
  onEdit: () => void;
  onDelete: () => void;
}

const Row = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{value}</span>
  </div>
);

export function TransactionDetailsDialog({
  open, onOpenChange, kind, entry, categoryLabel, accountName, personName, onEdit, onDelete,
}: Props) {
  if (!entry) return null;
  const isExpense = kind === 'expense';
  const secondary = isExpense ? (entry as ExpenseEntry).merchant : (entry as IncomeEntry).source;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isExpense ? 'Expense' : 'Income'} Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className={cn('text-2xl font-semibold tabular-nums', isExpense ? 'text-expense' : 'text-income')}>
            {isExpense ? '-' : '+'}
            {formatBDT(entry.amount)}
          </p>

          <div className="divide-y rounded-lg border px-3">
            <Row label="Date" value={formatDate(entry.occurred_on)} />
            <Row label="Category" value={categoryLabel} />
            <Row label={isExpense ? 'Merchant' : 'Source'} value={secondary || '—'} />
            {accountName && <Row label="Account" value={accountName} />}
            {personName && <Row label="Person" value={personName} />}
            {isExpense && <Row label="Scope" value={(entry as ExpenseEntry).scope} />}
            {entry.notes && <Row label="Notes" value={entry.notes} />}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Receipt / Voucher</p>
            <ReceiptManager entityType={kind} entityId={entry.id} compact />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
            <Button type="button" variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
