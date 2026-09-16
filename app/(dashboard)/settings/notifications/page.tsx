'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useT } from '@/components/providers/locale-provider';
import { friendlyError } from '@/lib/errors';

type IntervalUnit = 'minutes' | 'hours' | 'days' | 'months';
interface ReportInterval { unit: IntervalUnit; value: number }

type Prefs = {
  cc_due: boolean; cc_overdue: boolean; bills: boolean; loans: boolean;
  budget: boolean; savings: boolean; browser: boolean; weekly_report: boolean;
  report_interval: ReportInterval;
};
const DEFAULT: Prefs = {
  cc_due: true, cc_overdue: true, bills: true, loans: true, budget: true, savings: true,
  browser: false, weekly_report: true, report_interval: { unit: 'days', value: 7 },
};

// The cron job checking for due reports runs every 5 minutes (see
// vercel.json), so a shorter "minutes" value can't fire any faster than
// that regardless of what's picked here.
const UNIT_BOUNDS: Record<IntervalUnit, { min: number; max: number }> = {
  minutes: { min: 5, max: 59 },
  hours: { min: 1, max: 23 },
  days: { min: 1, max: 27 },
  months: { min: 1, max: 12 },
};
const UNIT_LABEL: Record<IntervalUnit, string> = {
  minutes: 'Minutes', hours: 'Hours', days: 'Days', months: 'Months',
};

const ROWS: { key: keyof Omit<Prefs, 'report_interval'>; label: string; hint: string }[] = [
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
      const loaded = (data?.notification_prefs as Partial<Prefs>) ?? {};
      setPrefs({
        ...DEFAULT,
        ...loaded,
        report_interval: { ...DEFAULT.report_interval, ...(loaded.report_interval ?? {}) },
      });
      setLoading(false);
    })();
  }, []);

  const toggle = (key: keyof Omit<Prefs, 'report_interval'>) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const setIntervalUnit = (unit: IntervalUnit) =>
    setPrefs((p) => ({
      ...p,
      report_interval: {
        unit,
        value: Math.min(Math.max(p.report_interval.value, UNIT_BOUNDS[unit].min), UNIT_BOUNDS[unit].max),
      },
    }));

  const setIntervalValue = (raw: string) => {
    const { unit } = prefs.report_interval;
    const n = Math.min(Math.max(Math.round(Number(raw) || UNIT_BOUNDS[unit].min), UNIT_BOUNDS[unit].min), UNIT_BOUNDS[unit].max);
    setPrefs((p) => ({ ...p, report_interval: { ...p.report_interval, value: n } }));
  };

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
          <CardTitle className="text-foreground">Income/expense report email</CardTitle>
          <p className="text-sm text-muted-foreground">
            A recurring email with your family's income, expenses and top spending categories, on whatever
            schedule you set below.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md px-2 py-2.5 hover:bg-accent/40">
            <span>
              <span className="block text-sm font-medium">Send me this report</span>
              <span className="block text-xs text-muted-foreground">Turn the email on or off</span>
            </span>
            <input
              type="checkbox"
              checked={prefs.weekly_report}
              onChange={() => toggle('weekly_report')}
              className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
            />
          </label>

          {prefs.weekly_report && (
            <div className="space-y-2 rounded-md border px-3 py-3">
              <p className="text-sm font-medium">Send every</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={UNIT_BOUNDS[prefs.report_interval.unit].min}
                  max={UNIT_BOUNDS[prefs.report_interval.unit].max}
                  value={prefs.report_interval.value}
                  onChange={(e) => setIntervalValue(e.target.value)}
                  className="w-20"
                />
                <Select value={prefs.report_interval.unit} onValueChange={(v) => setIntervalUnit(v as IntervalUnit)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(UNIT_LABEL) as IntervalUnit[]).map((u) => (
                      <SelectItem key={u} value={u}>{UNIT_LABEL[u]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Checked every 5 minutes, so a shorter interval than that won&apos;t arrive any faster.
                Minute/hour reports show today&apos;s totals so far — transactions are dated by day, not
                time of day, so there&apos;s no finer detail to show within a day.
              </p>
            </div>
          )}
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
            Email delivery for the reminders above isn&apos;t wired up yet — only the report above sends email today.
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
