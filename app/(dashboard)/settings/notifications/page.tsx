'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/providers/locale-provider';
import { friendlyError } from '@/lib/errors';

type Prefs = {
  cc_due: boolean; cc_overdue: boolean; bills: boolean; loans: boolean;
  budget: boolean; savings: boolean; browser: boolean;
};
const DEFAULT: Prefs = { cc_due: true, cc_overdue: true, bills: true, loans: true, budget: true, savings: true, browser: false };

const ROWS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: 'cc_due', label: 'Credit-card payment due', hint: 'When a statement due date is within 5 days' },
  { key: 'cc_overdue', label: 'Credit-card overdue', hint: 'When a statement passes its due date unpaid' },
  { key: 'bills', label: 'Bills', hint: 'Within each bill’s reminder window' },
  { key: 'loans', label: 'Loan payments', hint: 'When a loan EMI is due this month' },
  { key: 'budget', label: 'Budget exceeded', hint: '80% / 90% / over budget in a category' },
  { key: 'savings', label: 'Savings milestones', hint: 'When a goal reaches its target' },
];

export default function NotificationSettingsPage() {
  const t = useT();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('notification_prefs').eq('id', user.id).maybeSingle();
      setPrefs({ ...DEFAULT, ...((data?.notification_prefs as Partial<Prefs>) ?? {}) });
      setLoading(false);
    })();
  }, []);

  const toggle = (key: keyof Prefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const enableBrowser = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setPrefs((p) => ({ ...p, browser: perm === 'granted' }));
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('profiles').update({ notification_prefs: prefs }).eq('id', user!.id);
    setSaving(false);
    setMsg(error ? friendlyError(error) : t('settings.saved'));
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">{t('settings.notifications')}</CardTitle>
          <p className="text-sm text-muted-foreground">Choose which reminders Family Finance shows you.</p>
        </CardHeader>
        <CardContent className="space-y-1">
          {ROWS.map((r) => (
            <label key={r.key} className="flex cursor-pointer items-start justify-between gap-4 rounded-md px-2 py-2.5 hover:bg-accent/40">
              <span>
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.hint}</span>
              </span>
              <input
                type="checkbox"
                checked={prefs[r.key]}
                onChange={() => toggle(r.key)}
                className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Browser notifications</CardTitle>
          <p className="text-sm text-muted-foreground">
            Get a system notification when reminders appear, on devices that support it.
          </p>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={enableBrowser}>
            {prefs.browser ? 'Enabled' : 'Enable browser notifications'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Email notifications are delivered by Supabase Auth / a scheduled function (see README).
          </span>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : t('action.save')}</Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
