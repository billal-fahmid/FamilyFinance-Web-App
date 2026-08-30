import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FamilyProvider } from '@/components/providers/family-provider';
import { LocaleProvider } from '@/components/providers/locale-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ConnectivityProvider } from '@/components/providers/connectivity';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomNav } from '@/components/layout/bottom-nav';
import { Topbar } from '@/components/layout/topbar';
import { InstallAndOfflineBar } from '@/components/layout/install-prompt';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { count } = await supabase
    .from('family_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (!count) redirect('/family/new');

  return (
    <ThemeProvider>
      <LocaleProvider>
        <ConnectivityProvider>
          <FamilyProvider>
            <div className="flex min-h-screen bg-background">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <InstallAndOfflineBar />
                <Topbar />
                <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">{children}</main>
              </div>
              <BottomNav />
            </div>
          </FamilyProvider>
        </ConnectivityProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
