# Family Finance

A production-ready **family income, expense, savings and debt manager built for Bangladesh**.

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Auth, Postgres, Row-Level Security, Storage) · Zod · React Hook Form · Recharts · PWA (installable + offline).

Everything from Milestones 1–4 is implemented and working: accounts, income/expense, transfers, credit cards + statements + payments + EMI, budgets, bills, loans, savings goals, investments, assets, net worth, remittance, reports, analytics, calendar, shared expenses, family events, receipts (Supabase Storage), advanced search, CSV/Excel/PDF export, Bangla/English localization, light/dark theme, BDT + 6 other currencies, audit logging, soft-delete Trash, duplicate detection, offline sync, and a security-reviewed RLS model.

---

## Tech at a glance

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router, React 18, TypeScript (strict) |
| UI | Tailwind + Radix primitives (shadcn-style), Lucide icons |
| Data | Supabase Postgres, PostgREST, Row-Level Security on every table |
| Auth | Supabase Auth (email/password), cookie sessions via `@supabase/ssr`, route middleware |
| Files | Supabase Storage, private `receipts` bucket, family-scoped object policies |
| Charts | Recharts | Export | `xlsx`, `jspdf` + `jspdf-autotable` |
| PWA | `next-pwa` (Workbox) — precache, runtime caching, background-sync write queue |
| i18n | Custom lightweight `LocaleProvider` + `en`/`bn` dictionaries |

---

## Quick start (local)

```bash
npm install
cp .env.example .env               # then fill in the Supabase values
node scripts/gen-icons.mjs         # generates the PWA icons (already committed)
```

1. **Create a Supabase project** → https://supabase.com. From **Project Settings → API** copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` / publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` / secret key → `SUPABASE_SERVICE_ROLE_KEY` (server-only — never ship to the client)

2. **Apply the database** — open the Supabase **SQL Editor**, paste the whole of
   [`supabase/apply_all.sql`](supabase/apply_all.sql) and run it.
   This one file resets `public` and rebuilds the entire schema (Milestones 1–4):
   tables, enums, RLS policies, triggers, the `v_unified_spend` view, audit logging,
   the `receipts` Storage bucket + object policies, and seed categories.
   It is **safe to re-run** (it wipes app data, not auth users).
   Individual migrations live in [`supabase/migrations/`](supabase/migrations) for reference.

3. **Auth redirect URLs** — Supabase → Authentication → URL Configuration:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/api/auth/callback`

4. **(Optional) demo data** — after creating your family and finding its id
   (`select id, name from families;`), run [`supabase/seed_demo.sql`](supabase/seed_demo.sql)
   with that id substituted in. See the file header.

5. **Run it**

```bash
npm run dev          # http://localhost:3000
```

Sign up → you land on `/family/new` → create a family (e.g. "Hossen Family") → `/dashboard`.

> **Windows + OneDrive:** run this project from **plain local disk** (e.g. `C:\Users\<you>\dev\family-finance`),
> not inside a OneDrive/Dropbox folder. OneDrive turns `.next` files into cloud placeholders that Node
> reads as broken symlinks — both `npm run dev` and `next build` then fail with
> `EINVAL … readlink .next\package.json`. A junction inside the synced folder does not fix it.

More detail: [`docs/SETUP.md`](docs/SETUP.md) · [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/TESTING.md`](docs/TESTING.md)

---

## Accounting model (the important part)

- A **credit-card transaction** raises the card's `current_outstanding`. It never touches a cash account.
- A **refund / adjustment** lowers outstanding.
- A **credit-card payment** moves money bank → card: the paying account balance goes **down**,
  the card outstanding goes **down**, the linked statement's `amount_paid` goes **up**.
  It is **never written to `expenses`** — the original purchase is the expense.
  So a ৳5,000 grocery purchase on a card + a ৳5,000 card payment = **৳5,000 total expense, not ৳10,000.**
- Bill payments and loan payments decrement the paying account only (own triggers) — not expenses.
- Remittance = a normal `income` row (credits the account) + a `remittances` FX-detail row.
- Savings contributions only advance a goal's progress; they don't move real money (use a transfer).
- Family-event spend = normal `expenses` tagged with `event_id` — visible in every report.
- All account-balance maintenance is done by database triggers, so the numbers are correct
  regardless of which client wrote the row (web, offline replay, SQL). Soft-deleting a
  transaction reverses its balance effect; restoring re-applies it.

The Milestone-4 §18 scenario is scripted in [`docs/TESTING.md`](docs/TESTING.md) and
[`scripts/verify-accounting.mjs`](scripts/verify-accounting.mjs).

---

## Security

- **RLS on every table.** All access is gated by `is_family_member(family_id)` /
  `is_family_admin(family_id)` (SECURITY DEFINER helpers). No family can read or write
  another family's rows. `notifications` and `profiles` are per-user.
- **Storage**: private `receipts` bucket; `storage.objects` policies require the first
  path segment to be a family the user belongs to. Files are viewed via short-lived signed URLs.
- **Never stored**: full card numbers, CVV, plain-text passwords. Cards keep `last4` only,
  displayed as `**** 1234`. Passwords are handled entirely by Supabase Auth (bcrypt/argon).
- **Audit log**: a SECURITY DEFINER trigger writes a human-readable line to `audit_logs`
  for every create/edit/delete on core tables. There is **no client INSERT policy** on
  `audit_logs` — it cannot be forged from the browser.
- **Input validation**: Zod schemas on every form; DB `CHECK` constraints as a backstop.
- **Rate limiting**: Supabase Auth throttles sign-in/sign-up/OTP. The custom
  `/api/auth/signup` and `/api/family/create` routes verify the session server-side.
- **Session security**: httpOnly cookies via `@supabase/ssr`, refreshed in middleware;
  security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`) set in `next.config.js`.
- **Errors**: raw DB/network errors are never shown — `lib/errors.ts` maps them to
  friendly, localised messages.

---

## Offline & PWA

- Installable on Android / desktop / mobile (manifest + icons + service worker + in-app install prompt).
- Service worker (`next-pwa`/Workbox):
  - **GET** Supabase reads → `NetworkFirst` with a 24h cache, so opened pages work offline.
  - **POST/PATCH/DELETE** Supabase writes → `NetworkOnly` + a **background-sync queue**
    (`ff-mutations`). Writes made offline are replayed automatically when connectivity returns.
  - Storage objects and fonts → `CacheFirst`.
- Inserts carry a client-generated UUID (`newId()`), so a replayed write that already
  succeeded is a harmless primary-key no-op — **no duplicate transactions.**
- An offline banner + "synced" indicator sit above the top bar (`ConnectivityProvider`).
- `/offline` is the fallback route.

---

## Localization & currency

- `English` / `বাংলা`, switched in **Settings → Language**, persisted to the profile and `localStorage`.
- `lib/i18n/dict.ts` holds the dictionaries; `useT()` returns the translator. Coverage is
  thorough for the shell (nav, actions, dashboard, settings, empty states, errors) and
  extends key-by-key.
- Currency in **Settings → Currency**: `BDT` (default) + `USD EUR GBP INR SAR AED`.
  BDT/INR use lakh–crore grouping (`৳1,25,000`). Stored on the family row; `formatBDT()`
  follows it app-wide.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (Next config) |
| `node scripts/gen-icons.mjs` | (Re)generate PWA PNG icons |
| `node scripts/verify-accounting.mjs` | Run the §18 accounting scenario against your DB |

---

## Project layout

```
app/
  (auth)/            login, signup, forgot/reset password, verify email
  (dashboard)/       every feature page (see the sidebar groups)
  api/               auth/signup, auth/callback, family/create
  offline/           PWA fallback
components/
  ui/                Radix-based primitives (button, dialog, select, …)
  layout/            sidebar, topbar, bottom nav, install/offline bar
  providers/         family, locale, theme, connectivity
  <feature>/         dialogs & cards per feature
lib/
  supabase/          browser + server + admin clients
  validations/       Zod schemas
  i18n/              dictionaries
  finance.ts errors.ts export.ts insights.ts duplicate-check.ts utils.ts
supabase/
  apply_all.sql      ← run this
  migrations/        0001…0004 for reference
  seed_demo.sql      optional demo data
types/database.ts    hand-written row types
```

---

## Deliverables checklist (Milestone 4 §19)

- ✅ Complete source code
- ✅ Database schema + migrations (`supabase/migrations/0001–0004`) + one-shot `apply_all.sql`
- ✅ RLS policies (in every migration; summarised above)
- ✅ Seed data (`0001` system categories) + demo data (`supabase/seed_demo.sql`)
- ✅ `.env.example`
- ✅ README + `docs/SETUP.md` + `docs/DEPLOYMENT.md` + `docs/TESTING.md`
- ✅ No feature left as a fake placeholder (the sidebar's only "Soon" items — Savings *statements*
  style pages — were removed; every listed nav item is a real page).
