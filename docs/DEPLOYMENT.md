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
For **email**:

1. Add a Supabase **Edge Function** `notify-email` that, given a `notifications`
   row, sends via your SMTP/Resend API key (function secret, never in the client).
2. Add a `pg_cron` job (or a DB webhook on `notifications` insert) that calls it,
   respecting each user's `profiles.notification_prefs`.
3. Include an unsubscribe link that flips the relevant `notification_prefs` key.

The data model (`notifications`, `notification_prefs`, dedupe keys) is already in
place; only the delivery function is environment-specific and left unimplemented.
