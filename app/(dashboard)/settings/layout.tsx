'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useT } from '@/components/providers/locale-provider';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();

  const tabs = [
    { href: '/settings/profile', label: t('settings.profile') },
    { href: '/settings/password', label: t('settings.password') },
    { href: '/settings/family', label: t('settings.family') },
    { href: '/settings/appearance', label: t('settings.appearance') },
    { href: '/settings/language', label: t('settings.language') },
    { href: '/settings/currency', label: t('settings.currency') },
    { href: '/settings/notifications', label: t('settings.notifications') },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">{t('settings.title')}</h1>

      <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium transition-colors',
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
