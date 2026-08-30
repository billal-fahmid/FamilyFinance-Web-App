'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PiggyBank,
  CreditCard,
  Receipt,
  Landmark,
  Bell,
  Users,
  Settings,
  Search,
  TrendingUp,
  Home,
  Scale,
  Globe,
  CalendarDays,
  PartyPopper,
  FileBarChart,
  BarChart3,
  Target,
  Split,
  Paperclip,
  Trash2,
  ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/components/providers/locale-provider';
import { LogoMark } from '@/components/brand/logo-mark';

type Item = { label: string; href: string; icon: typeof Wallet; comingSoon?: boolean };
type Group = { heading: string; items: Item[] };

const HEADING_KEY: Record<string, string> = {
  Overview: 'nav.overview', Money: 'nav.money', Wealth: 'nav.wealth',
  Plan: 'nav.plan', Insights: 'nav.insights', Family: 'nav.family',
};
const HREF_KEY: Record<string, string> = {
  '/dashboard': 'nav.dashboard', '/transactions': 'nav.transactions', '/accounts': 'nav.accounts',
  '/search': 'nav.search', '/receipts': 'nav.receipts', '/credit-cards': 'nav.creditCards',
  '/budget': 'nav.budget', '/bills': 'nav.bills', '/loans': 'nav.loans', '/savings': 'nav.savings',
  '/investments': 'nav.investments', '/assets': 'nav.assets', '/net-worth': 'nav.netWorth',
  '/remittance': 'nav.remittance', '/events': 'nav.events', '/shared': 'nav.shared',
  '/calendar': 'nav.calendar', '/reports': 'nav.reports', '/analytics': 'nav.analytics',
  '/notifications': 'nav.notifications', '/activity': 'nav.activity', '/family': 'nav.members',
  '/trash': 'nav.trash', '/settings/profile': 'nav.settings',
};

const GROUPS: Group[] = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
      { label: 'Accounts', href: '/accounts', icon: Wallet },
      { label: 'Search', href: '/search', icon: Search },
      { label: 'Receipts', href: '/receipts', icon: Paperclip },
    ],
  },
  {
    heading: 'Money',
    items: [
      { label: 'Credit Cards', href: '/credit-cards', icon: CreditCard },
      { label: 'Budget', href: '/budget', icon: PiggyBank },
      { label: 'Bills', href: '/bills', icon: Receipt },
      { label: 'Loans', href: '/loans', icon: Landmark },
    ],
  },
  {
    heading: 'Wealth',
    items: [
      { label: 'Savings Goals', href: '/savings', icon: Target },
      { label: 'Investments', href: '/investments', icon: TrendingUp },
      { label: 'Assets', href: '/assets', icon: Home },
      { label: 'Net Worth', href: '/net-worth', icon: Scale },
      { label: 'Remittance', href: '/remittance', icon: Globe },
    ],
  },
  {
    heading: 'Plan',
    items: [
      { label: 'Events', href: '/events', icon: PartyPopper },
      { label: 'Shared Expenses', href: '/shared', icon: Split },
      { label: 'Calendar', href: '/calendar', icon: CalendarDays },
    ],
  },
  {
    heading: 'Insights',
    items: [
      { label: 'Reports', href: '/reports', icon: FileBarChart },
      { label: 'Analytics', href: '/analytics', icon: BarChart3 },
      { label: 'Notifications', href: '/notifications', icon: Bell },
      { label: 'Activity Log', href: '/activity', icon: ScrollText },
    ],
  },
  {
    heading: 'Family',
    items: [
      { label: 'Members', href: '/family', icon: Users },
      { label: 'Trash', href: '/trash', icon: Trash2 },
      { label: 'Settings', href: '/settings/profile', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const t = useT();
  const tr = (key: string | undefined, fallback: string) => (key ? t(key) : fallback);

  return (
    <aside className="brand-gradient hidden w-60 shrink-0 flex-col border-r border-white/10 text-white md:flex">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 px-5">
        <LogoMark className="h-8 w-8" />
        <span className="text-[15px] font-bold leading-none tracking-tight">
          Family<span className="text-brand-gold">Finance</span>
        </span>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {GROUPS.map((group) => (
          <div key={group.heading} className="space-y-0.5">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
              {tr(HEADING_KEY[group.heading], group.heading)}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.comingSoon ? '#' : item.href}
                  aria-disabled={item.comingSoon}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex items-center justify-between rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                    item.comingSoon
                      ? 'cursor-not-allowed text-white/30'
                      : active
                      ? 'bg-white/15 text-white shadow-[inset_3px_0_0_hsl(var(--brand-gold))]'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      className={cn(
                        'h-[18px] w-[18px] transition-transform',
                        !item.comingSoon && 'group-hover:scale-110'
                      )}
                    />
                    {tr(HREF_KEY[item.href], item.label)}
                  </span>
                  {item.comingSoon && (
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-normal">Soon</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-5 py-3 text-[11px] text-white/40">
        Smarter finances, happier families
      </div>
    </aside>
  );
}
