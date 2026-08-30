'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTheme, type ThemePref } from '@/components/providers/theme-provider';
import { useT } from '@/components/providers/locale-provider';

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme();
  const t = useT();

  const options: { value: ThemePref; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('settings.theme.light'), icon: Sun },
    { value: 'dark', label: t('settings.theme.dark'), icon: Moon },
    { value: 'system', label: t('settings.theme.system'), icon: Monitor },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">{t('settings.appearance')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('settings.theme.desc')}</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {options.map((o) => {
            const Icon = o.icon;
            const active = theme === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setTheme(o.value)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-sm font-medium transition-colors',
                  active ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-ring/50'
                )}
              >
                <Icon className="h-5 w-5" />
                {o.label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
