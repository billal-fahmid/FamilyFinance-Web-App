# Deployment

The app is a standard Next.js 14 App-Router application + a Supabase backend.
Any Node host works; Vercel is the smoothest.

## Supabase (production)

1. Use a dedicated **production** Supabase project (don't share with dev).
2. Run `supabase/apply_all.sql` in its SQL Editor **once**. ⚠️ Re-running it wipes
   app data — for later changes, write a new incremental migration instead.
3. **Authentication → URL Configuration**:
   - Site URL: `https://your-domain.com`
   - Redirect URLs: `https://your-domain.com/api/auth/callback`
4. **Authentication → Emails**: configure custom SMTP (Resend / SES / Postmark) so
   password-reset and (if you re-enable it) confirmation email actually send.
   The built-in sender is rate-limited and not for production.
5. **Authentication → Rate Limits**: raise sensibly once SMTP is set.
6. Storage: the `receipts` bucket and its policies are created by `apply_all.sql`.
   Confirm it exists and is **not public**.

## Vercel

1. Import the repo.
2. **Environment Variables** (Production + Preview):
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY        (mark as sensitive)
   NEXT_PUBLIC_SITE_URL=https://your-domain.com
   ```
3. Build command `next build`, output auto-detected. No extra config.
4. Deploy. The service worker is generated at build time into `public/` and served
   from the root scope.

## Self-hosted (Node)

```bash
npm ci
npm run build
NODE_ENV=production npm start        # listens on :3000
```

Put it behind Nginx/Caddy with TLS. Set the same env vars. `next-pwa` is disabled
in dev and active in the production build.

## Post-deploy checklist

- [ ] Sign up + create a family on the live URL.
- [ ] Add an expense, refresh — number persists.
- [ ] Run the §18 accounting scenario (see `docs/TESTING.md`).
- [ ] Install the PWA from a mobile browser; confirm it opens standalone.
- [ ] Toggle airplane mode, add a Quick Expense, re-enable — it syncs.
- [ ] Switch language to বাংলা and back.
- [ ] Upload a receipt; open it (signed URL) from another account in the same
      family (should work) and a different family (should 403).
- [ ] Check `select * from audit_logs order by created_at desc limit 20;`.

## Scheduled trash purge (optional)

`purge_trash(fam, 30)` is an RPC the Trash page calls on demand. To automate,
add a Supabase **Scheduled Function** (pg_cron) that iterates families:

```sql
select cron.schedule('purge-trash-nightly', '0 3 * * *', $$
  do $body$
  declare f uuid;
  begin
    for f in select id from public.families loop
      delete from public.expenses  where family_id = f and deleted_at < now() - interval '30 days';
      delete from public.income    where family_id = f and deleted_at < now() - interval '30 days';
      delete from public.transfers where family_id = f and deleted_at < now() - interval '30 days';
    end loop;
  end
  $body$;
$$);
```

## Email notification architecture

In-app + browser notifications work today (`notifications` table + the
`generate_financial_notifications` RPC called on load, + the Notification API).

**Income/expense report email (implemented):** `app/api/cron/weekly-report`
sends each opted-in family member (`profiles.notification_prefs.weekly_report`,
default on — configured in Settings → Notifications) a per-family summary of
income, expenses and top spending categories, via Resend, **on whatever
schedule that person picked** — minutes, hours, days, or months.

- Each profile stores `notification_prefs.report_interval = { unit, value }`
  and `weekly_report_last_sent_at`. The route runs on a tight cron and, each
  time, only emails members whose `now - last_sent_at >= interval` — i.e. the
  cron fires often, but any one person's actual send cadence is theirs.
- `occurred_on` on transactions is a calendar date with no time-of-day, so a
  minutes/hours interval can only ever show "today's totals so far" — there's
  no finer resolution in the data to slice by. Day/month intervals show a
  real date range.
- Requires `RESEND_API_KEY` + `INVITE_FROM_EMAIL` (already used by invites)
  and `CRON_SECRET` — a long random string (`openssl rand -hex 32`). Without
  either pair set, the route responds `{ ok: false, reason: 'not_configured' }`
  and sends nothing.
- On Vercel: `vercel.json`'s `crons` entry fires it every 5 minutes.
  Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on cron
  requests once that env var is set — no extra wiring needed.
  ⚠️ **Vercel Cron Jobs on the Hobby (free) plan can only run once per day**,
  regardless of what `vercel.json` says — Vercel silently caps it. On Hobby,
  the finest cadence that will actually arrive on time is daily; anyone who
  picks minutes/hours/a few days will just get their report once a day
  instead (still correct content, just less frequent than requested).
  Every-5-minutes delivery needs a **Pro** plan or higher.
- On a non-Vercel host: trigger it yourself every 5 minutes (system cron,
  GitHub Actions on a schedule, etc.) with:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/weekly-report
  ```
- To test manually against a live deploy, the same `curl` command works —
  each call only sends to whoever is actually due, so it's safe to call by
  hand as often as you like.

**Other in-app notification types** (`cc_due`, `cc_overdue`, `bills`, `loans`,
`budget`, `savings`) still don't have an email path. To add one:

1. Add a Supabase **Edge Function** `notify-email` that, given a `notifications`
   row, sends via your SMTP/Resend API key (function secret, never in the client).
2. Add a `pg_cron` job (or a DB webhook on `notifications` insert) that calls it,
   respecting each user's `profiles.notification_prefs`.
3. Include an unsubscribe link that flips the relevant `notification_prefs` key.

The data model (`notifications`, `notification_prefs`, dedupe keys) is already
in place for this; only the delivery function is left unimplemented.
