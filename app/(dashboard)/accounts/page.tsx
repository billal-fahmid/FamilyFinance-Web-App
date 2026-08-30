'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ArrowLeftRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { AccountCard } from '@/components/accounts/account-card';
import { AccountFormDialog } from '@/components/accounts/account-form-dialog';
import { formatBDT } from '@/lib/utils';
import type { Account } from '@/types/database';

export default function AccountsPage() {
  const { currentFamily } = useFamily();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const load = useCallback(async () => {
    if (!currentFamily) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('family_id', currentFamily.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: true });
    setAccounts((data as Account[]) ?? []);
  }, [currentFamily]);

  useEffect(() => {
    load();
  }, [load]);

  const total = accounts.reduce((s, a) => s + Number(a.current_balance), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Accounts</h1>
          <p className="text-sm text-muted-foreground">Total balance: {formatBDT(total)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/accounts/transfer">
              <ArrowLeftRight className="mr-1 h-4 w-4" /> Transfer
            </Link>
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Add Account
          </Button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No accounts yet — add your first one (cash, bank, bKash, Nagad…) to start tracking balances.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} onEdit={() => { setEditing(a); setDialogOpen(true); }} />
          ))}
        </div>
      )}

      <AccountFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={load} editing={editing} />
    </div>
  );
}
