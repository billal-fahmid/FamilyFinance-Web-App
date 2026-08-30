# Setup

## Prerequisites

- Node 18.17+ (Node 20 LTS recommended)
- A Supabase project (free tier is fine)

## 1. Install

```bash
npm install
cp .env.example .env
```

## 2. Supabase project

1. Create a project at https://supabase.com.
2. **Project Settings → API** — copy into `.env`:
   | `.env` key | Supabase field |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | `service_role` / secret key |
3. `NEXT_PUBLIC_SITE_URL` = `http://localhost:3000` for local.

## 3. Database

Open the Supabase **SQL Editor** → **New query** → paste all of
`supabase/apply_all.sql` → **Run**.

- It drops and rebuilds the `public` schema, so it is **idempotent** — re-run it
  any time you want a clean slate. It does **not** touch `auth.users`.
- It ends with `notify pgrst, 'reload schema'`. If, right after running, the app
  shows `new row violates row-level security policy`, wait ~2 minutes (PostgREST
  policy cache) or hit **Settings → API → Reload schema cache**.

What it creates: 30+ tables, 12 enums, ~120 RLS policies, ~25 trigger functions,
the `v_unified_spend` view, audit-log triggers on all core tables, the private
`receipts` Storage bucket + object policies, and the seeded Bangladesh category list.

### Applying via CLI instead (optional)

```bash
supabase link --project-ref YOUR-REF
supabase db push          # applies supabase/migrations/0001…0004 in order
```

## 4. Auth configuration

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: `http://localhost:3000/api/auth/callback`

Email confirmation: the app's `/api/auth/signup` route creates the user with the
admin API (`email_confirm: true`) so **no confirmation email is required** for
local dev. In production either keep that flow or configure custom SMTP under
Authentication → Emails and remove the admin-create shortcut.

## 5. Icons

The PWA icons are committed. To regenerate (e.g. after changing the brand colour
in `scripts/gen-icons.mjs`):

```bash
node scripts/gen-icons.mjs
```

## 6. Run

```bash
npm run dev
```

Visit http://localhost:3000, sign up, create a family, and you're in.

## 7. Demo data (optional)

```sql
-- 1. find your family id
select id, name from public.families;
-- 2. edit supabase/seed_demo.sql — set :fam to that id (top of the file)
-- 3. paste the edited file into the SQL Editor and run
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Could not find the table 'public.families'` | `apply_all.sql` hasn't been run yet. |
| `new row violates row-level security policy` right after migrating | PostgREST cache lag — wait 2 min or reload the schema cache. |
| `type "family_role" already exists` in SQL Editor | You ran a single migration file twice. Use `apply_all.sql` (it resets first). |
| `EINVAL … readlink .next/package.json` on `npm run dev` or `next build` | The project sits inside a OneDrive/Dropbox folder, which turns `.next` files into cloud placeholders Node mis-reads as broken symlinks. **Fix: keep the project on plain local disk** (e.g. `C:\Users\<you>\dev\family-finance`). Junctions *inside* the synced folder don't help — the link itself is intercepted. |
| Category dropdown empty in Add Expense | You're on pre-Milestone-3 schema — run `apply_all.sql`. |
