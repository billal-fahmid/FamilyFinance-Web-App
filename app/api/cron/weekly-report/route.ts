import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { escapeHtml, sendEmail } from '@/lib/email';
import { formatMoney, formatDate, toLocalISODate } from '@/lib/utils';

// Income/expense report email, on each member's own schedule (minutes /
// hours / days / months — set in Settings -> Notifications). Triggered every
// 5 minutes by Vercel Cron (see vercel.json); each run only sends to members
// whose next-due time has actually passed, tracked via
// profiles.weekly_report_last_sent_at. Vercel automatically sends
// `Authorization: Bearer $CRON_SECRET` on cron-invoked requests when that
// env var is set, which doubles as this route's auth. On other hosts, hit
// this endpoint yourself every few minutes with the same header (see
// docs/DEPLOYMENT.md).
export const dynamic = 'force-dynamic';

type IntervalUnit = 'minutes' | 'hours' | 'days' | 'months';
interface ReportInterval {
  unit: IntervalUnit;
  value: number;
}
interface NotificationPrefs {
  weekly_report?: boolean;
  report_interval?: ReportInterval;
}

const DEFAULT_INTERVAL: ReportInterval = { unit: 'days', value: 7 };

function intervalMs(interval: ReportInterval): number {
  const value = Math.max(1, Math.floor(Number(interval.value) || 1));
  switch (interval.unit) {
    case 'minutes': return value * 60_000;
    case 'hours': return value * 3_600_000;
    case 'months': return value * 30 * 86_400_000; // approximate — fine for a "how often" cadence
    case 'days':
    default: return value * 86_400_000;
  }
}

function intervalLabel(interval: ReportInterval): string {
  const value = Math.max(1, Math.floor(Number(interval.value) || 1));
  const unitWord = { minutes: 'minute', hours: 'hour', days: 'day', months: 'month' }[interval.unit] ?? 'day';
  return `every ${value} ${unitWord}${value === 1 ? '' : 's'}`;
}

// occurred_on is a calendar date with no time component, so sub-day
// intervals can only ever report "today's activity so far" — there's no
// finer resolution in the underlying data to slice by.
function rangeLabelFor(rangeStartISO: string, now: Date, interval: ReportInterval): string {
  if (interval.unit === 'minutes' || interval.unit === 'hours') {
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `Today, ${formatDate(toLocalISODate(now))} (as of ${time})`;
  }
  const endISO = toLocalISODate(now);
  return rangeStartISO === endISO ? formatDate(rangeStartISO) : `${formatDate(rangeStartISO)} – ${formatDate(endISO)}`;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_FROM_EMAIL;
  if (!apiKey || !from) {
    return NextResponse.json({ ok: false, reason: 'not_configured' });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error('[weekly-report] admin client failed', err);
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
  }

  const now = new Date();
  // Upper bound is exclusive, so use "start of tomorrow" — otherwise a
  // same-day range (gte today, lt today) would always match zero rows.
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const endExclusiveISO = toLocalISODate(tomorrow);

  const [{ data: families, error: familiesError }, { data: categories }] = await Promise.all([
    admin.from('families').select('id, name, currency'),
    admin.from('categories').select('key, label'),
  ]);
  if (familiesError) {
    console.error('[weekly-report] could not load families', familiesError);
    return NextResponse.json({ ok: false, error: 'Could not load families' }, { status: 500 });
  }
  const categoryLabel = new Map<string, string>((categories ?? []).map((c: any) => [c.key, c.label]));

  // One lookup for every user's email, instead of one admin API call per member.
  const emailById = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    data.users.forEach((u) => { if (u.email) emailById.set(u.id, u.email); });
    if (data.users.length < 1000) break;
  }

  let familiesProcessed = 0;
  let membersChecked = 0;
  let emailsSent = 0;
  const errors: string[] = [];

  for (const fam of families ?? []) {
    familiesProcessed += 1;
    try {
      const { data: members } = await admin
        .from('family_members')
        .select('user_id, display_name')
        .eq('family_id', fam.id)
        .eq('status', 'active')
        .not('user_id', 'is', null);
      if (!members || members.length === 0) continue;

      const memberUserIds = members.map((m: any) => m.user_id as string).filter(Boolean);
      const { data: profiles } = memberUserIds.length
        ? await admin.from('profiles').select('id, notification_prefs, weekly_report_last_sent_at').in('id', memberUserIds)
        : { data: [] as { id: string; notification_prefs: NotificationPrefs | null; weekly_report_last_sent_at: string | null }[] };
      const profileById = new Map((profiles ?? []).map((p: any) => [p.id as string, p]));

      for (const member of members as { user_id: string | null; display_name: string }[]) {
        if (!member.user_id) continue;
        membersChecked += 1;

        const profile = profileById.get(member.user_id);
        const prefs = (profile?.notification_prefs ?? {}) as NotificationPrefs;
        // Opted out explicitly; missing/undefined means the default (on).
        if (prefs.weekly_report === false) continue;

        const interval = prefs.report_interval ?? DEFAULT_INTERVAL;
        const ms = intervalMs(interval);
        const lastSentAt = profile?.weekly_report_last_sent_at ? new Date(profile.weekly_report_last_sent_at) : null;
        // Never sent before -> due right now, on this cron tick.
        if (lastSentAt && now.getTime() - lastSentAt.getTime() < ms) continue;

        const email = emailById.get(member.user_id);
        if (!email) continue;

        const rangeStart = lastSentAt ?? new Date(now.getTime() - ms);
        const rangeStartISO = toLocalISODate(rangeStart);

        const [{ data: incomeRows }, { data: spendRows }] = await Promise.all([
          admin.from('income').select('amount').eq('family_id', fam.id).is('deleted_at', null)
            .gte('occurred_on', rangeStartISO).lt('occurred_on', endExclusiveISO),
          admin.from('v_unified_spend').select('amount, category_key').eq('family_id', fam.id)
            .gte('occurred_on', rangeStartISO).lt('occurred_on', endExclusiveISO),
        ]);

        const totalIncome = (incomeRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
        const totalExpense = (spendRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
        const net = totalIncome - totalExpense;

        const catTotals = new Map<string, number>();
        (spendRows ?? []).forEach((r: any) => {
          catTotals.set(r.category_key, (catTotals.get(r.category_key) ?? 0) + Number(r.amount));
        });
        const topCategories = [...catTotals.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([key, amount]) => ({ label: categoryLabel.get(key) ?? key, amount }));

        const currency = fam.currency || 'BDT';
        const rangeLabel = rangeLabelFor(rangeStartISO, now, interval);
        const cadence = intervalLabel(interval);

        const html = buildEmailHtml({
          displayName: member.display_name,
          familyName: fam.name,
          rangeLabel,
          cadence,
          currency,
          totalIncome,
          totalExpense,
          net,
          topCategories,
          siteUrl,
        });

        const result = await sendEmail({
          apiKey,
          from,
          to: email,
          subject: `Your ${fam.name} summary — ${rangeLabel}`,
          html,
          text:
            `${rangeLabel}\nIncome: ${formatMoney(totalIncome, currency)}\n` +
            `Expenses: ${formatMoney(totalExpense, currency)}\nNet: ${formatMoney(net, currency)}\n\n` +
            `View details: ${siteUrl}/dashboard`,
        });

        if (result.ok) {
          emailsSent += 1;
          await admin.from('profiles').update({ weekly_report_last_sent_at: now.toISOString() }).eq('id', member.user_id);
        } else {
          errors.push(`${fam.name} -> ${email}: HTTP ${result.status} ${result.detail}`.trim());
        }
      }
    } catch (err) {
      errors.push(`${fam.name}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, familiesProcessed, membersChecked, emailsSent, errors });
}

function buildEmailHtml(input: {
  displayName: string;
  familyName: string;
  rangeLabel: string;
  cadence: string;
  currency: string;
  totalIncome: number;
  totalExpense: number;
  net: number;
  topCategories: { label: string; amount: number }[];
  siteUrl: string;
}) {
  const { displayName, familyName, rangeLabel, cadence, currency, totalIncome, totalExpense, net, topCategories, siteUrl } = input;
  const netColor = net >= 0 ? '#16A34A' : '#DC2626';
  const rows = topCategories
    .map(
      (c) =>
        `<tr><td style="padding:6px 0;color:#334155">${escapeHtml(c.label)}</td>` +
        `<td style="padding:6px 0;text-align:right;color:#0f172a;font-weight:600">${formatMoney(c.amount, currency)}</td></tr>`
    )
    .join('');

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <h2 style="color:#0284C7;margin:0 0 4px">Family Finance</h2>
      <p style="color:#64748b;font-size:13px;margin:0 0 16px">Summary for ${escapeHtml(familyName)} · ${rangeLabel}</p>
      <p>Hi ${escapeHtml(displayName)},</p>
      <p>Here's how ${escapeHtml(familyName)} looks so far:</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr>
          <td style="padding:10px;background:#f0fdf4;border-radius:8px 0 0 8px">
            <div style="font-size:11px;color:#64748b">Income</div>
            <div style="font-size:18px;font-weight:700;color:#16A34A">${formatMoney(totalIncome, currency)}</div>
          </td>
          <td style="padding:10px;background:#fef2f2;width:1px"></td>
          <td style="padding:10px;background:#fef2f2">
            <div style="font-size:11px;color:#64748b">Expenses</div>
            <div style="font-size:18px;font-weight:700;color:#DC2626">${formatMoney(totalExpense, currency)}</div>
          </td>
          <td style="padding:10px;background:#f8fafc;border-radius:0 8px 8px 0">
            <div style="font-size:11px;color:#64748b">Net</div>
            <div style="font-size:18px;font-weight:700;color:${netColor}">${formatMoney(net, currency)}</div>
          </td>
        </tr>
      </table>

      ${
        rows
          ? `<p style="margin:20px 0 6px;font-weight:600;font-size:13px">Top spending categories</p>
             <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`
          : ''
      }

      ${
        siteUrl
          ? `<p style="margin:24px 0">
               <a href="${siteUrl}/dashboard" style="background:#0284C7;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
                 View full dashboard
               </a>
             </p>`
          : ''
      }

      <p style="color:#94a3b8;font-size:12px;margin-top:24px">
        You're getting this ${cadence} because it's on for your account.
        ${siteUrl ? `<a href="${siteUrl}/settings/notifications" style="color:#94a3b8">Change the schedule or turn it off in Settings → Notifications</a>.` : ''}
      </p>
    </div>`;
}
