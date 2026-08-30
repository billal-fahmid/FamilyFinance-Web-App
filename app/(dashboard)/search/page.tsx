'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search as SearchIcon, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatBDT, formatDate } from '@/lib/utils';
import { exportCSV, exportXLSX, exportPDF } from '@/lib/export';
import type { Account, Category, CreditCard, FamilyMember } from '@/types/database';

type Kind = 'all' | 'income' | 'expense' | 'credit_card';

interface ResultRow {
  id: string;
  kind: 'income' | 'expense' | 'credit_card';
  date: string;
  amount: number;
  category: string;
  merchant: string;
  account: string;
  person: string;
}

const ANY = '__any__';

export default function SearchPage() {
  const { currentFamily } = useFamily();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  const [f, setF] = useState({
    kind: 'all' as Kind,
    from: '',
    to: '',
    min: '',
    max: '',
    category: ANY,
    member: ANY,
    account: ANY,
    card: ANY,
    merchant: '',
  });

  useEffect(() => {
    if (!currentFamily) return;
    const supabase = createClient();
    supabase.from('accounts').select('*').eq('family_id', currentFamily.id).then(({ data }) => setAccounts((data as Account[]) ?? []));
    supabase.from('credit_cards').select('*').eq('family_id', currentFamily.id).then(({ data }) => setCards((data as CreditCard[]) ?? []));
    supabase.from('family_members').select('*').eq('family_id', currentFamily.id).then(({ data }) => setMembers((data as FamilyMember[]) ?? []));
    supabase.from('categories').select('*').then(({ data }) => setCategories((data as Category[]) ?? []));
  }, [currentFamily]);

  const catLabel = useCallback(
    (key: string | null) => categories.find((c) => c.key === key)?.label ?? key ?? '—',
    [categories]
  );
  const acctName = useCallback((id: string | null) => accounts.find((a) => a.id === id)?.name ?? '', [accounts]);
  const memberName = useCallback((id: string | null) => members.find((m) => m.id === id)?.display_name ?? '', [members]);
  const cardName = useCallback((id: string | null) => {
    const c = cards.find((x) => x.id === id);
    return c ? `${c.provider} ${c.card_name}` : '';
  }, [cards]);

  const run = async () => {
    if (!currentFamily) return;
    setLoading(true);
    setRan(true);
    const supabase = createClient();
    const fam = currentFamily.id;

    const applyCommon = (q: any, dateCol: string) => {
      if (f.from) q = q.gte(dateCol, f.from);
      if (f.to) q = q.lte(dateCol, f.to);
      if (f.min) q = q.gte('amount', Number(f.min));
      if (f.max) q = q.lte('amount', Number(f.max));
      if (f.member !== ANY) q = q.eq('person_id', f.member);
      return q;
    };

    const out: ResultRow[] = [];

    if (f.kind === 'all' || f.kind === 'expense') {
      let q = supabase.from('expenses').select('*').eq('family_id', fam).is('deleted_at', null);
      q = applyCommon(q, 'occurred_on');
      if (f.category !== ANY) q = q.eq('category_key', f.category);
      if (f.account !== ANY) q = q.eq('account_id', f.account);
      if (f.merchant) q = q.ilike('merchant', `%${f.merchant}%`);
      const { data } = await q.order('occurred_on', { ascending: false }).limit(500);
      (data ?? []).forEach((r: any) =>
        out.push({
          id: r.id, kind: 'expense', date: r.occurred_on, amount: Number(r.amount),
          category: catLabel(r.category_key), merchant: r.merchant ?? '',
          account: acctName(r.account_id), person: memberName(r.person_id),
        })
      );
    }

    if (f.kind === 'all' || f.kind === 'income') {
      let q = supabase.from('income').select('*').eq('family_id', fam).is('deleted_at', null);
      q = applyCommon(q, 'occurred_on');
      if (f.category !== ANY) q = q.eq('category_key', f.category);
      if (f.account !== ANY) q = q.eq('account_id', f.account);
      if (f.merchant) q = q.ilike('source', `%${f.merchant}%`);
      const { data } = await q.order('occurred_on', { ascending: false }).limit(500);
      (data ?? []).forEach((r: any) =>
        out.push({
          id: r.id, kind: 'income', date: r.occurred_on, amount: Number(r.amount),
          category: catLabel(r.category_key), merchant: r.source ?? '',
          account: acctName(r.account_id), person: memberName(r.person_id),
        })
      );
    }

    if (f.kind === 'all' || f.kind === 'credit_card') {
      let q = supabase.from('credit_card_transactions').select('*').eq('family_id', fam);
      q = applyCommon(q, 'occurred_on');
      if (f.card !== ANY) q = q.eq('card_id', f.card);
      if (f.merchant) q = q.ilike('merchant', `%${f.merchant}%`);
      const { data } = await q.order('occurred_on', { ascending: false }).limit(500);
      (data ?? []).forEach((r: any) =>
        out.push({
          id: r.id, kind: 'credit_card', date: r.occurred_on, amount: Number(r.amount),
          category: r.category_key ? catLabel(r.category_key) : r.type, merchant: r.merchant ?? '',
          account: cardName(r.card_id), person: memberName(r.person_id),
        })
      );
    }

    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    setRows(out);
    setLoading(false);
  };

  const totals = useMemo(() => {
    const inc = rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0);
    const exp = rows.filter((r) => r.kind !== 'income').reduce((s, r) => s + r.amount, 0);
    return { inc, exp, count: rows.length };
  }, [rows]);

  const exportRows = () =>
    rows.map((r) => ({
      Date: r.date, Type: r.kind, Amount: r.amount, Category: r.category,
      Merchant: r.merchant, 'Account / Card': r.account, Person: r.person,
    }));
  const cols = ['Date', 'Type', 'Amount', 'Category', 'Merchant', 'Account / Card', 'Person'];

  const expenseCats = categories.filter((c) => c.type === 'expense');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Advanced Search</h1>
        <p className="text-sm text-muted-foreground">Filter every transaction across the family</p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 pt-6 sm:grid-cols-3 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v as Kind })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="expense">Expenses</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="credit_card">Credit card</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Merchant / source</Label>
            <Input value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })} placeholder="contains…" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Min amount</Label>
            <Input type="number" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max amount</Label>
            <Input type="number" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {expenseCats.map((c) => <SelectItem key={c.id} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Member</Label>
            <Select value={f.member} onValueChange={(v) => setF({ ...f, member: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Account</Label>
            <Select value={f.account} onValueChange={(v) => setF({ ...f, account: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Credit card</Label>
            <Select value={f.card} onValueChange={(v) => setF({ ...f, card: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.provider} {c.card_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <Button className="w-full" onClick={run} disabled={loading}>
              <SearchIcon className="mr-1 h-4 w-4" /> {loading ? 'Searching…' : 'Search'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {ran && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {totals.count} results · income {formatBDT(totals.inc)} · outflow {formatBDT(totals.exp)}
            </p>
            {rows.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline"><Download className="mr-1 h-4 w-4" /> Export</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportCSV('search-results', cols, exportRows())}>CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportXLSX('search-results', [{ name: 'Results', columns: cols, rows: exportRows() }])}>Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportPDF('search-results', 'Search Results', [{ columns: cols, rows: exportRows() }])}>PDF</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              {rows.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No matching transactions.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Category</th>
                      <th className="px-4 py-2">Merchant / source</th>
                      <th className="px-4 py-2">Account / card</th>
                      <th className="px-4 py-2">Person</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r) => (
                      <tr key={`${r.kind}-${r.id}`}>
                        <td className="whitespace-nowrap px-4 py-2">{formatDate(r.date)}</td>
                        <td className="px-4 py-2 capitalize">{r.kind.replace('_', ' ')}</td>
                        <td className="px-4 py-2">{r.category}</td>
                        <td className="px-4 py-2">{r.merchant}</td>
                        <td className="px-4 py-2">{r.account}</td>
                        <td className="px-4 py-2">{r.person}</td>
                        <td className={'px-4 py-2 text-right font-medium tabular-nums ' + (r.kind === 'income' ? 'text-income' : 'text-expense')}>
                          {formatBDT(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
