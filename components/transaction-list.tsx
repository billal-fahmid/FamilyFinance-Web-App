'use client';

import { useMemo, useState } from 'react';
import { Search, Pencil, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { formatBDT, formatDate, cn } from '@/lib/utils';

export interface ListRow {
  id: string;
  amount: number;
  occurred_on: string;
  categoryLabel: string;
  secondary?: string | null; // source / merchant
}

interface Props {
  rows: ListRow[];
  categoryOptions: { key: string; label: string }[];
  tone: 'income' | 'expense';
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onRowClick?: (id: string) => void;
}

export function TransactionList({ rows, categoryOptions, tone, onEdit, onDelete, onRowClick }: Props) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesQuery =
        !query ||
        r.secondary?.toLowerCase().includes(query.toLowerCase()) ||
        r.categoryLabel.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || r.categoryLabel === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [rows, query, categoryFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search notes, merchant, source…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c.key} value={c.label}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Details</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No transactions found
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr
                key={r.id}
                className={cn('hover:bg-accent/40', onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(r.id)}
              >
                <td className="px-4 py-2 whitespace-nowrap">{formatDate(r.occurred_on)}</td>
                <td className="px-4 py-2">{r.categoryLabel}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.secondary || '—'}</td>
                <td
                  className={cn(
                    'px-4 py-2 text-right font-medium tabular-nums',
                    tone === 'income' ? 'text-income' : 'text-expense'
                  )}
                >
                  {tone === 'income' ? '+' : '-'}
                  {formatBDT(r.amount)}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); onEdit(r.id); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); onDelete(r.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
