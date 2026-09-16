import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { escapeHtml, sendEmail } from '@/lib/email';
import { formatMoney, formatDate, toLocalISODate } from '@/lib/utils';

// Weekly income/expense summary, one email per opted-in family member.
// Triggered by Vercel Cron (see vercel.json) — Vercel automatically sends
// `Authorization: Bearer $CRON_SECRET` on cron-invoked requests when that
// env var is set, which doubles as this route's auth. On other hosts, hit
// this endpoint yourself on a schedule with the same header (see
// docs/DEPLOYMENT.md).
export const dynamic = 'force-dynamic';

interface NotificationPrefs {
  weekly_report?: boolean;
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

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  const startISO = toLocalISODate(start);
  const endISO = toLocalISODate(end);
  const rangeLabel = `${formatDate(startISO)} – ${formatDate(endISO)}`;

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
  let emailsSent = 0;
  const errors: string[] = [];

  for (const fam of families ?? []) {
    familiesProcessed += 1;
    try {
      const [{ data: incomeRows }, { data: spendRows }, { data: members }] = await Promise.all([
        admin.from('income').select('amount').eq('family_id', fam.id).is('deleted_at', null)
          .gte('occurred_on', startISO).lt('occurred_on', endISO),
        admin.from('v_unified_spend').select('amount, category_key').eq('family_id', fam.id)
          .gte('occurred_on', startISO).lt('occurred_on', endISO),
        admin.from('family_members').select('user_id, display_name').eq('family_id', fam.id)
          .eq('status', 'active').not('user_id', 'is', null),
      ]);

      if (!members || members.length === 0) continue;

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

      const memberUserIds = members.map((m: any) => m.user_id as string).filter(Boolean);
      const { data: profiles } = memberUserIds.length
        ? await admin.from('profiles').select('id, notification_prefs').in('id', memberUserIds)
        : { data: [] as { id: string; notification_prefs: NotificationPrefs | null }[] };
      const prefsById = new Map(
        (profiles ?? []).map((p: any) => [p.id as string, p.notification_prefs as NotificationPrefs | null])
      );

      for (const member of members as { user_id: string | null; display_name: string }[]) {
        if (!member.user_id) continue;
        // Opted out explicitly; missing/undefined means the default (on).
        if (prefsById.get(member.user_id)?.weekly_report === false) continue;
        const email = emailById.get(member.user_id);
        if (!email) continue;

        const currency = fam.currency || 'BDT';
        const html = buildEmailHtml({
          displayName: member.display_name,
          familyName: fam.name,
          rangeLabel,
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
          subject: `Your weekly summary — ${fam.name} (${rangeLabel})`,
          html,
          text:
            `${rangeLabel}\nIncome: ${formatMoney(totalIncome, currency)}\n` +
            `Expenses: ${formatMoney(totalExpense, currency)}\nNet: ${formatMoney(net, currency)}\n\n` +
            `View details: ${siteUrl}/dashboard`,
        });

        if (result.ok) {
          emailsSent += 1;
        } else {
          errors.push(`${fam.name} -> ${email}: HTTP ${result.status} ${result.detail}`.trim());
        }
      }
    } catch (err) {
      errors.push(`${fam.name}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, familiesProcessed, emailsSent, errors });
}

function buildEmailHtml(input: {
  displayName: string;
  familyName: string;
  rangeLabel: string;
  currency: string;
  totalIncome: number;
  totalExpense: number;
  net: number;
  topCategories: { label: string; amount: number }[];
  siteUrl: string;
}) {
  const { displayName, familyName, rangeLabel, currency, totalIncome, totalExpense, net, topCategories, siteUrl } = input;
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
      <p style="color:#64748b;font-size:13px;margin:0 0 16px">Weekly summary for ${escapeHtml(familyName)} · ${rangeLabel}</p>
      <p>Hi ${escapeHtml(displayName)},</p>
      <p>Here's how ${escapeHtml(familyName)} did this week:</p>

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
        You're getting this because weekly summaries are on for your account.
        ${siteUrl ? `<a href="${siteUrl}/settings/notifications" style="color:#94a3b8">Manage in Settings → Notifications</a>.` : ''}
      </p>
    </div>`;
}
