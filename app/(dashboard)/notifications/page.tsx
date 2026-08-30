'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Check, Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate, cn } from '@/lib/utils';
import type { AppNotification } from '@/types/database';

const TYPE_STYLE: Record<string, string> = {
  credit_card_overdue: 'border-l-destructive',
  credit_card_due: 'border-l-amber-500',
  minimum_payment: 'border-l-amber-500',
  bill_reminder: 'border-l-primary',
  budget_alert: 'border-l-destructive',
  loan_payment_due: 'border-l-amber-500',
  invite: 'border-l-primary',
};

export default function NotificationsPage() {
  const { currentFamily } = useFamily();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setItems((data as AppNotification[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const regenerate = async () => {
    if (!currentFamily) return;
    setRefreshing(true);
    const supabase = createClient();
    await supabase.rpc('generate_financial_notifications', { fam: currentFamily.id });
    await load();
    setRefreshing(false);
  };

  const markRead = async (id: string) => {
    const supabase = createClient();
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllRead = async () => {
    const supabase = createClient();
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unread = items.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unread} unread</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={!unread}>
            <Check className="mr-1 h-4 w-4" /> Mark all read
          </Button>
          <Button size="sm" onClick={regenerate} disabled={refreshing}>
            <RefreshCw className={cn('mr-1 h-4 w-4', refreshing && 'animate-spin')} /> Check now
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Bell className="mx-auto mb-2 h-6 w-6" />
          Nothing yet. Hit “Check now” to scan for credit-card due dates, overdue bills, budget overages and loan EMIs.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id} className={cn('border-l-4', TYPE_STYLE[n.type] ?? 'border-l-muted', !n.is_read && 'bg-accent/40')}>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div>
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDate(n.created_at)}
                    {n.link && (
                      <>
                        {' · '}
                        <Link href={n.link} className="text-primary hover:underline">View</Link>
                      </>
                    )}
                  </p>
                </div>
                {!n.is_read && (
                  <button onClick={() => markRead(n.id)} className="shrink-0 text-xs text-primary hover:underline">
                    Mark read
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
