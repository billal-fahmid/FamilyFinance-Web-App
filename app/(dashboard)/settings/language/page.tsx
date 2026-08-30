'use client';

import { Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLocale } from '@/components/providers/locale-provider';
import { LOCALES } from '@/lib/i18n/dict';

export default function LanguageSettingsPage() {
  const { locale, setLocale, t } = useLocale();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">{t('settings.language')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('settings.language.desc')}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {LOCALES.map((l) => (
          <button
            key={l.code}
            onClick={() => setLocale(l.code)}
            className={cn(
              'flex w-full items-center justify-between rounded-lg border p-3 text-sm transition-colors',
              locale === l.code ? 'border-primary bg-primary/5' : 'hover:border-ring/50'
            )}
          >
            <span>
              <span className="font-medium">{l.native}</span>
              {l.native !== l.label && <span className="ml-2 text-muted-foreground">{l.label}</span>}
            </span>
            {locale === l.code && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
