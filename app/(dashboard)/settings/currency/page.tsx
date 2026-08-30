'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useFamily } from '@/components/providers/family-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, SUPPORTED_CURRENCIES, CURRENCIES, formatMoney } from '@/lib/utils';
import { useT } from '@/components/providers/locale-provider';
import { friendlyError } from '@/lib/errors';

export default function CurrencySettingsPage() {
  const { currentFamily, currentRole, refresh } = useFamily();
  const t = useT();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEdit = currentRole === 'owner' || currentRole === 'admin';
  const current = currentFamily?.currency ?? 'BDT';

  const change = async (code: string) => {
    if (!currentFamily || !canEdit || code === current) return;
    setError(null);
    setSaving(code);
    const supabase = createClient();
    const { error: e } = await supabase.from('families').update({ currency: code }).eq('id', currentFamily.id);
    setSaving(null);
    if (e) return setError(friendlyError(e));
    await refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">{t('settings.currency')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('settings.currency.desc')}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {!canEdit && (
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Only an owner or admin can change the family currency.
          </p>
        )}
        {SUPPORTED_CURRENCIES.map((code) => (
          <button
            key={code}
            disabled={!canEdit || saving !== null}
            onClick={() => change(code)}
            className={cn(
              'flex w-full items-center justify-between rounded-lg border p-3 text-sm transition-colors disabled:opacity-60',
              current === code ? 'border-primary bg-primary/5' : 'hover:border-ring/50'
            )}
          >
            <span>
              <span className="font-medium">{code}</span>
              <span className="ml-2 text-muted-foreground">
                {formatMoney(125000, code)} · {formatMoney(5000, code)}
              </span>
            </span>
            {current === code && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="pt-1 text-xs text-muted-foreground">
          BDT and INR use lakh/crore grouping ({CURRENCIES.BDT.symbol}1,25,000).
        </p>
      </CardContent>
    </Card>
  );
}
