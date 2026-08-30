'use client';

import { useRouter } from 'next/navigation';
import { Plus, LogOut, User as UserIcon, Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';
import { QuickExpenseDialog } from '@/components/expense/quick-expense-dialog';

export function Topbar() {
  const router = useRouter();
  const { currentFamily, families, setCurrentFamilyId } = useFamily();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!currentFamily) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      // Scan for due/overdue obligations, then read the unread count.
      await supabase.rpc('generate_financial_notifications', { fam: currentFamily.id });
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);
      if (!cancelled) setUnread(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentFamily]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:px-6">
      <div className="flex items-center gap-2">
        {families.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="font-medium">
                {currentFamily?.name ?? 'Select family'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {families.map((f) => (
                <DropdownMenuItem key={f.id} onClick={() => setCurrentFamilyId(f.id)}>
                  {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="font-medium">{currentFamily?.name ?? 'Family Finance'}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setQuickAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Quick Expense
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => router.push('/notifications')}
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <UserIcon className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push('/settings/profile')}>
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings/password')}>
              Change password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <QuickExpenseDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </header>
  );
}
