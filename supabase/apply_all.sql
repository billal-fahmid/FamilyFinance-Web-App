-- ==== FamFinance full schema — safe to run repeatedly ====
-- Resets the `public` schema, then rebuilds everything from scratch. This
-- wipes all app data (families, accounts, transactions, cards, budgets, …)
-- but NOT auth users. Run the whole file in the Supabase SQL Editor.
-- ============================================================================

-- The auth-user trigger lives in the auth schema, so drop it explicitly
-- before wiping public (its function is about to disappear).
drop trigger if exists trg_on_auth_user_created on auth.users;

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables    in schema public to postgres, anon, authenticated, service_role;
grant all on all routines  in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on routines  to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;

-- ============================================================================
-- MILESTONE 1 — Family Income & Expense Management
-- Foundation schema: families, members, roles, accounts, income, expenses,
-- transfers, categories, tags, notifications, audit logs.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
create type family_role as enum ('owner', 'admin', 'member', 'viewer');

create type account_type as enum (
  'cash', 'bank', 'bkash', 'nagad', 'rocket', 'debit_card', 'savings', 'other'
);

create type transaction_scope as enum ('personal', 'shared', 'family');

create type recurring_frequency as enum (
  'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'
);

create type notification_type as enum (
  'invite', 'budget_alert', 'bill_reminder', 'system', 'other'
);

-- ----------------------------------------------------------------------------
-- PROFILES (mirrors auth.users, 1:1)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  default_family_id uuid, -- FK added after families table exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- FAMILIES
-- ----------------------------------------------------------------------------
create table public.families (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  currency text not null default 'BDT',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_default_family_fk
  foreign key (default_family_id) references public.families(id) on delete set null;

-- ----------------------------------------------------------------------------
-- FAMILY MEMBERS (join table: user <-> family, with role + profile-ish fields)
-- ----------------------------------------------------------------------------
create table public.family_members (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade, -- null until invite accepted
  invited_email text, -- used before the invited user has an account
  display_name text not null,
  photo_url text,
  relationship text, -- e.g. "Father", "Spouse", "Child"
  role family_role not null default 'member',
  status text not null default 'active' check (status in ('invited', 'active', 'removed')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_members_user_or_email check (user_id is not null or invited_email is not null),
  unique (family_id, user_id)
);

create index idx_family_members_family on public.family_members(family_id);
create index idx_family_members_user on public.family_members(user_id);

-- ----------------------------------------------------------------------------
-- CATEGORIES (system defaults + optional family-custom subcategories)
-- ----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade, -- null = global/system category
  type text not null check (type in ('income', 'expense')),
  parent_key text, -- e.g. 'housing', 'food' — null for income or top-level
  key text not null, -- e.g. 'rent', 'grocery', 'salary'
  label text not null,
  icon text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (family_id, type, parent_key, key)
);

create index idx_categories_family on public.categories(family_id);
create index idx_categories_type on public.categories(type);

-- ----------------------------------------------------------------------------
-- ACCOUNTS
-- ----------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  owner_member_id uuid references public.family_members(id) on delete set null,
  name text not null,
  type account_type not null,
  opening_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  masked_number text, -- e.g. "**** 4821" — never store full account numbers
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_accounts_family on public.accounts(family_id);

-- ----------------------------------------------------------------------------
-- TAGS
-- ----------------------------------------------------------------------------
create table public.tags (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  color text default '#64748b',
  created_at timestamptz not null default now(),
  unique (family_id, name)
);

-- ----------------------------------------------------------------------------
-- INCOME
-- ----------------------------------------------------------------------------
create table public.income (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  person_id uuid references public.family_members(id) on delete set null,
  category_key text not null, -- e.g. 'salary', 'freelancing'
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  source text,
  notes text,
  is_recurring boolean not null default false,
  frequency recurring_frequency,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_income_family on public.income(family_id);
create index idx_income_account on public.income(account_id);
create index idx_income_date on public.income(occurred_on);
create index idx_income_category on public.income(category_key);

-- ----------------------------------------------------------------------------
-- EXPENSES
-- ----------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  person_id uuid references public.family_members(id) on delete set null,
  category_key text not null,   -- e.g. 'housing'
  subcategory_key text,         -- e.g. 'rent'
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  merchant text,
  notes text,
  scope transaction_scope not null default 'family',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_expenses_family on public.expenses(family_id);
create index idx_expenses_account on public.expenses(account_id);
create index idx_expenses_date on public.expenses(occurred_on);
create index idx_expenses_category on public.expenses(category_key);

-- ----------------------------------------------------------------------------
-- TRANSACTION_TAGS (many-to-many; polymorphic over income/expenses)
-- ----------------------------------------------------------------------------
create table public.transaction_tags (
  id uuid primary key default uuid_generate_v4(),
  tag_id uuid not null references public.tags(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  transaction_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tag_id, transaction_type, transaction_id)
);

create index idx_transaction_tags_txn on public.transaction_tags(transaction_type, transaction_id);

-- ----------------------------------------------------------------------------
-- TRANSFERS (between accounts — never counted as income/expense)
-- ----------------------------------------------------------------------------
create table public.transfers (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  from_account_id uuid not null references public.accounts(id) on delete restrict,
  to_account_id uuid not null references public.accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint transfers_distinct_accounts check (from_account_id <> to_account_id)
);

create index idx_transfers_family on public.transfers(family_id);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type notification_type not null default 'other',
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on public.notifications(user_id);

-- ----------------------------------------------------------------------------
-- AUDIT LOGS
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,       -- e.g. 'expense.create', 'member.invite'
  entity_type text,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_family on public.audit_logs(family_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Is the current auth user an active member of the given family?
create or replace function public.is_family_member(fam_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.family_members fm
    where fm.family_id = fam_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

-- Current auth user's role within the given family (or null if not a member)
create or replace function public.family_role_of(fam_id uuid)
returns family_role
language sql
security definer
stable
as $$
  select fm.role from public.family_members fm
  where fm.family_id = fam_id
    and fm.user_id = auth.uid()
    and fm.status = 'active'
  limit 1;
$$;

-- Owner/Admin check, used to gate mutations like inviting/removing members
create or replace function public.is_family_admin(fam_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select public.family_role_of(fam_id) in ('owner', 'admin');
$$;

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_families_updated_at before update on public.families
  for each row execute function public.set_updated_at();
create trigger trg_family_members_updated_at before update on public.family_members
  for each row execute function public.set_updated_at();
create trigger trg_accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger trg_income_updated_at before update on public.income
  for each row execute function public.set_updated_at();
create trigger trg_expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Account balance maintenance: income/expense/transfer mutations adjust balances
create or replace function public.apply_income_balance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.accounts set current_balance = current_balance + new.amount where id = new.account_id;
  elsif tg_op = 'UPDATE' then
    update public.accounts set current_balance = current_balance - old.amount where id = old.account_id;
    update public.accounts set current_balance = current_balance + new.amount where id = new.account_id;
  elsif tg_op = 'DELETE' then
    update public.accounts set current_balance = current_balance - old.amount where id = old.account_id;
  end if;
  return null;
end;
$$;

create trigger trg_income_balance
  after insert or update or delete on public.income
  for each row execute function public.apply_income_balance();

create or replace function public.apply_expense_balance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.accounts set current_balance = current_balance - new.amount where id = new.account_id;
  elsif tg_op = 'UPDATE' then
    update public.accounts set current_balance = current_balance + old.amount where id = old.account_id;
    update public.accounts set current_balance = current_balance - new.amount where id = new.account_id;
  elsif tg_op = 'DELETE' then
    update public.accounts set current_balance = current_balance + old.amount where id = old.account_id;
  end if;
  return null;
end;
$$;

create trigger trg_expense_balance
  after insert or update or delete on public.expenses
  for each row execute function public.apply_expense_balance();

create or replace function public.apply_transfer_balance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.accounts set current_balance = current_balance - new.amount where id = new.from_account_id;
    update public.accounts set current_balance = current_balance + new.amount where id = new.to_account_id;
  elsif tg_op = 'DELETE' then
    update public.accounts set current_balance = current_balance + old.amount where id = old.from_account_id;
    update public.accounts set current_balance = current_balance - old.amount where id = old.to_account_id;
  end if;
  return null;
end;
$$;

create trigger trg_transfer_balance
  after insert or delete on public.transfers
  for each row execute function public.apply_transfer_balance();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.tags enable row level security;
alter table public.income enable row level security;
alter table public.expenses enable row level security;
alter table public.transaction_tags enable row level security;
alter table public.transfers enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- PROFILES: user can read/update only their own profile
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

-- FAMILIES: visible to members only; only the creator can insert;
-- only owner/admin can update; only owner can delete.
create policy families_select_member on public.families
  for select using (public.is_family_member(id));
create policy families_insert_self on public.families
  for insert with check (created_by = auth.uid());
create policy families_update_admin on public.families
  for update using (public.is_family_admin(id));
create policy families_delete_owner on public.families
  for delete using (public.family_role_of(id) = 'owner');

-- FAMILY_MEMBERS: visible to fellow members; admins can manage
create policy family_members_select on public.family_members
  for select using (public.is_family_member(family_id));
create policy family_members_insert_admin on public.family_members
  for insert with check (public.is_family_admin(family_id));
create policy family_members_update_admin on public.family_members
  for update using (public.is_family_admin(family_id) or user_id = auth.uid());
create policy family_members_delete_admin on public.family_members
  for delete using (public.is_family_admin(family_id));

-- CATEGORIES: global (family_id null) readable by everyone authenticated;
-- family-custom categories scoped to members; only admins manage custom ones.
create policy categories_select on public.categories
  for select using (family_id is null or public.is_family_member(family_id));
create policy categories_insert_admin on public.categories
  for insert with check (family_id is not null and public.is_family_admin(family_id));
create policy categories_update_admin on public.categories
  for update using (family_id is not null and public.is_family_admin(family_id));
create policy categories_delete_admin on public.categories
  for delete using (family_id is not null and public.is_family_admin(family_id));

-- ACCOUNTS
create policy accounts_select on public.accounts
  for select using (public.is_family_member(family_id));
create policy accounts_insert on public.accounts
  for insert with check (public.is_family_member(family_id));
create policy accounts_update on public.accounts
  for update using (public.is_family_member(family_id));
create policy accounts_delete_admin on public.accounts
  for delete using (public.is_family_admin(family_id));

-- TAGS
create policy tags_select on public.tags
  for select using (public.is_family_member(family_id));
create policy tags_cud on public.tags
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- INCOME
create policy income_select on public.income
  for select using (public.is_family_member(family_id));
create policy income_insert on public.income
  for insert with check (public.is_family_member(family_id) and created_by = auth.uid());
create policy income_update on public.income
  for update using (public.is_family_member(family_id));
create policy income_delete on public.income
  for delete using (public.is_family_member(family_id));

-- EXPENSES
create policy expenses_select on public.expenses
  for select using (public.is_family_member(family_id));
create policy expenses_insert on public.expenses
  for insert with check (public.is_family_member(family_id) and created_by = auth.uid());
create policy expenses_update on public.expenses
  for update using (public.is_family_member(family_id));
create policy expenses_delete on public.expenses
  for delete using (public.is_family_member(family_id));

-- TRANSACTION_TAGS: allowed if the user can see the underlying tag's family
create policy transaction_tags_all on public.transaction_tags
  for all using (
    exists (select 1 from public.tags t where t.id = tag_id and public.is_family_member(t.family_id))
  )
  with check (
    exists (select 1 from public.tags t where t.id = tag_id and public.is_family_member(t.family_id))
  );

-- TRANSFERS
create policy transfers_select on public.transfers
  for select using (public.is_family_member(family_id));
create policy transfers_insert on public.transfers
  for insert with check (public.is_family_member(family_id) and created_by = auth.uid());
create policy transfers_delete on public.transfers
  for delete using (public.is_family_member(family_id));

-- NOTIFICATIONS: only the target user can see/manage their own
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid());
create policy notifications_delete_own on public.notifications
  for delete using (user_id = auth.uid());

-- AUDIT_LOGS: read-only for family members, writes happen via security-definer
-- functions/service role only (no direct client insert policy on purpose)
create policy audit_logs_select on public.audit_logs
  for select using (family_id is not null and public.is_family_member(family_id));

-- ============================================================================
-- SEED: SYSTEM CATEGORIES (global, family_id = null)
-- ============================================================================
insert into public.categories (type, parent_key, key, label, is_system) values
  ('income', null, 'salary', 'Salary', true),
  ('income', null, 'freelancing', 'Freelancing', true),
  ('income', null, 'business', 'Business', true),
  ('income', null, 'rental_income', 'Rental Income', true),
  ('income', null, 'bonus', 'Bonus', true),
  ('income', null, 'overtime', 'Overtime', true),
  ('income', null, 'commission', 'Commission', true),
  ('income', null, 'remittance', 'Remittance', true),
  ('income', null, 'interest_profit', 'Interest/Profit', true),
  ('income', null, 'agriculture', 'Agriculture', true),
  ('income', null, 'other', 'Other', true),

  ('expense', 'housing', 'rent', 'Rent', true),
  ('expense', 'housing', 'electricity', 'Electricity', true),
  ('expense', 'housing', 'gas', 'Gas', true),
  ('expense', 'housing', 'water', 'Water', true),
  ('expense', 'housing', 'internet', 'Internet', true),
  ('expense', 'housing', 'mobile', 'Mobile', true),
  ('expense', 'housing', 'maintenance', 'Maintenance', true),

  ('expense', 'food', 'grocery', 'Grocery', true),
  ('expense', 'food', 'rice', 'Rice', true),
  ('expense', 'food', 'vegetables', 'Vegetables', true),
  ('expense', 'food', 'fish', 'Fish', true),
  ('expense', 'food', 'meat', 'Meat', true),
  ('expense', 'food', 'restaurant', 'Restaurant', true),
  ('expense', 'food', 'food_delivery', 'Food Delivery', true),

  ('expense', 'transportation', 'bus', 'Bus', true),
  ('expense', 'transportation', 'cng', 'CNG', true),
  ('expense', 'transportation', 'rickshaw', 'Rickshaw', true),
  ('expense', 'transportation', 'uber', 'Uber', true),
  ('expense', 'transportation', 'pathao', 'Pathao', true),
  ('expense', 'transportation', 'fuel', 'Fuel', true),
  ('expense', 'transportation', 'parking', 'Parking', true),
  ('expense', 'transportation', 'vehicle_maintenance', 'Vehicle Maintenance', true),

  ('expense', 'health', 'doctor', 'Doctor', true),
  ('expense', 'health', 'medicine', 'Medicine', true),
  ('expense', 'health', 'hospital', 'Hospital', true),
  ('expense', 'health', 'diagnostic', 'Diagnostic', true),
  ('expense', 'health', 'dental', 'Dental', true),

  ('expense', 'education', 'school', 'School', true),
  ('expense', 'education', 'university', 'University', true),
  ('expense', 'education', 'coaching', 'Coaching', true),
  ('expense', 'education', 'books', 'Books', true),
  ('expense', 'education', 'courses', 'Courses', true),

  ('expense', 'personal', 'clothes', 'Clothes', true),
  ('expense', 'personal', 'shoes', 'Shoes', true),
  ('expense', 'personal', 'shopping', 'Shopping', true),
  ('expense', 'personal', 'salon', 'Salon', true),
  ('expense', 'personal', 'cosmetics', 'Cosmetics', true),

  ('expense', 'family', 'children', 'Children', true),
  ('expense', 'family', 'parents', 'Parents', true),
  ('expense', 'family', 'gifts', 'Gifts', true),
  ('expense', 'family', 'family_events', 'Family Events', true),

  ('expense', 'religious', 'zakat', 'Zakat', true),
  ('expense', 'religious', 'donation', 'Donation', true),
  ('expense', 'religious', 'charity', 'Charity', true),

  ('expense', 'other', 'other', 'Other', true);


-- ============================================================================
-- MILESTONE 2 — Credit Cards, Credit Bills, Budgets, Bills & Debt
-- Builds on 0001_init.sql. Adds:
--   credit_cards, credit_card_transactions, credit_card_statements,
--   credit_card_payments, credit_card_emi,
--   budgets, budget_categories,
--   bills, bill_payments,
--   loans, loan_payments
-- plus balance/outstanding triggers, a unified-spend view, and a
-- financial-notification generator.
--
-- ACCOUNTING RULES (critical):
--   * A credit-card transaction (purchase/fee/interest/cash advance/EMI)
--     INCREASES the card's outstanding. It never touches a cash account.
--   * A refund / negative adjustment DECREASES outstanding.
--   * A credit-card PAYMENT moves money bank -> card:
--       - paying account balance goes DOWN
--       - card outstanding goes DOWN
--       - the linked statement's amount_paid goes UP
--       - it is NOT recorded as an expense (the original purchase is the expense)
--   * Bill payments and loan payments decrease the paying account balance via
--     their own triggers and are not written to the expenses table (keeps the
--     obligation ledgers self-contained and avoids double counting).
-- ============================================================================

-- Don't semantically validate plpgsql bodies at CREATE time — several
-- functions below reference enum labels added earlier in this same script.
set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
create type credit_card_txn_type as enum (
  'purchase', 'online_purchase', 'pos_purchase', 'cash_advance',
  'fee', 'interest', 'refund', 'emi_purchase', 'adjustment'
);

create type statement_status as enum ('unpaid', 'partially_paid', 'paid', 'overdue');

create type loan_type as enum ('personal', 'home', 'car', 'family', 'other');

-- Extra notification categories (existing enum: invite, budget_alert,
-- bill_reminder, system, other). ADD VALUE runs outside a txn block and the
-- new labels are only used from application code, never later in this script.
alter type notification_type add value if not exists 'credit_card_due';
alter type notification_type add value if not exists 'credit_card_overdue';
alter type notification_type add value if not exists 'minimum_payment';
alter type notification_type add value if not exists 'loan_payment_due';

-- ----------------------------------------------------------------------------
-- SHARED HELPERS
-- ----------------------------------------------------------------------------
create or replace function public.advance_date(d date, f recurring_frequency)
returns date language sql immutable as $$
  select case f
    when 'daily'     then d + interval '1 day'
    when 'weekly'    then d + interval '1 week'
    when 'biweekly'  then d + interval '2 weeks'
    when 'monthly'   then d + interval '1 month'
    when 'quarterly' then d + interval '3 months'
    when 'yearly'    then d + interval '1 year'
  end::date;
$$;

create or replace function public.cc_txn_sign(t credit_card_txn_type)
returns int language sql immutable as $$
  select case when t in ('refund', 'adjustment') then -1 else 1 end;
$$;

-- ============================================================================
-- 1. CREDIT CARDS
-- ============================================================================
create table public.credit_cards (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  owner_member_id uuid references public.family_members(id) on delete set null, -- cardholder
  provider text not null,                 -- bank / card provider, e.g. "EBL", "City Bank"
  card_name text not null,                -- e.g. "Visa Signature"
  cardholder_name text,                   -- free-text fallback if not a member
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),  -- masked; never store full PAN/CVV
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  current_outstanding numeric(14,2) not null default 0,
  statement_balance numeric(14,2) not null default 0,
  minimum_payment numeric(14,2) not null default 0,
  statement_day smallint check (statement_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  annual_fee numeric(14,2) not null default 0,
  interest_rate numeric(6,2) not null default 0,  -- APR %
  notes text,
  is_archived boolean not null default false,
  available_credit numeric(14,2) generated always as (credit_limit - current_outstanding) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_credit_cards_family on public.credit_cards(family_id);

-- ============================================================================
-- 5. CREDIT CARD EMI  (declared before transactions so the FK resolves)
-- ============================================================================
create table public.credit_card_emi (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  product text not null,
  original_amount numeric(14,2) not null check (original_amount > 0),
  down_payment numeric(14,2) not null default 0 check (down_payment >= 0),
  tenure_months smallint not null check (tenure_months > 0),
  monthly_installment numeric(14,2) not null check (monthly_installment >= 0),
  interest_rate numeric(6,2) not null default 0,
  start_date date not null default current_date,
  end_date date,
  installments_paid smallint not null default 0 check (installments_paid >= 0),
  notes text,
  financed_amount numeric(14,2) generated always as (original_amount - down_payment) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_cc_emi_family on public.credit_card_emi(family_id);
create index idx_cc_emi_card on public.credit_card_emi(card_id);

-- ============================================================================
-- 2. CREDIT CARD TRANSACTIONS
-- ============================================================================
create table public.credit_card_transactions (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  person_id uuid references public.family_members(id) on delete set null,
  emi_id uuid references public.credit_card_emi(id) on delete set null,
  type credit_card_txn_type not null default 'purchase',
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  merchant text,
  category_key text,
  notes text,
  receipt_url text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_cc_txn_family on public.credit_card_transactions(family_id);
create index idx_cc_txn_card on public.credit_card_transactions(card_id);
create index idx_cc_txn_date on public.credit_card_transactions(occurred_on);

create or replace function public.apply_cc_txn_outstanding()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.credit_cards
      set current_outstanding = current_outstanding + new.amount * public.cc_txn_sign(new.type)
      where id = new.card_id;
  elsif tg_op = 'UPDATE' then
    update public.credit_cards
      set current_outstanding = current_outstanding - old.amount * public.cc_txn_sign(old.type)
      where id = old.card_id;
    update public.credit_cards
      set current_outstanding = current_outstanding + new.amount * public.cc_txn_sign(new.type)
      where id = new.card_id;
  elsif tg_op = 'DELETE' then
    update public.credit_cards
      set current_outstanding = current_outstanding - old.amount * public.cc_txn_sign(old.type)
      where id = old.card_id;
  end if;
  return null;
end;
$$;

create trigger trg_cc_txn_outstanding
  after insert or update or delete on public.credit_card_transactions
  for each row execute function public.apply_cc_txn_outstanding();

-- ============================================================================
-- 3. CREDIT CARD STATEMENTS / BILLS
-- ============================================================================
create table public.credit_card_statements (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  statement_date date not null,
  statement_balance numeric(14,2) not null check (statement_balance >= 0),
  minimum_payment numeric(14,2) not null default 0 check (minimum_payment >= 0),
  due_date date not null,
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  status statement_status not null default 'unpaid',
  notes text,
  remaining_dues numeric(14,2) generated always as (statement_balance - amount_paid) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, statement_date)
);
create index idx_cc_stmt_family on public.credit_card_statements(family_id);
create index idx_cc_stmt_card on public.credit_card_statements(card_id);
create index idx_cc_stmt_due on public.credit_card_statements(due_date);

create or replace function public.set_statement_status()
returns trigger language plpgsql as $$
begin
  if new.amount_paid >= new.statement_balance then
    new.status := 'paid';
  elsif new.due_date < current_date then
    new.status := 'overdue';
  elsif new.amount_paid > 0 then
    new.status := 'partially_paid';
  else
    new.status := 'unpaid';
  end if;
  return new;
end;
$$;

create trigger trg_cc_stmt_status
  before insert or update on public.credit_card_statements
  for each row execute function public.set_statement_status();

-- Mirror the latest statement's headline figures onto the card for quick display
create or replace function public.sync_card_from_statement()
returns trigger language plpgsql as $$
declare latest record;
begin
  select * into latest from public.credit_card_statements
    where card_id = coalesce(new.card_id, old.card_id)
    order by statement_date desc limit 1;
  if found then
    update public.credit_cards set
      statement_balance = latest.statement_balance,
      minimum_payment   = latest.minimum_payment
      where id = latest.card_id;
  end if;
  return null;
end;
$$;

create trigger trg_sync_card_from_statement
  after insert or update or delete on public.credit_card_statements
  for each row execute function public.sync_card_from_statement();

-- ============================================================================
-- 4. CREDIT CARD PAYMENTS  (bank -> card; never an expense)
-- ============================================================================
create table public.credit_card_payments (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  statement_id uuid references public.credit_card_statements(id) on delete set null,
  from_account_id uuid not null references public.accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index idx_cc_pay_family on public.credit_card_payments(family_id);
create index idx_cc_pay_card on public.credit_card_payments(card_id);

create or replace function public.apply_cc_payment()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.accounts       set current_balance      = current_balance - new.amount   where id = new.from_account_id;
    update public.credit_cards   set current_outstanding  = current_outstanding - new.amount where id = new.card_id;
    if new.statement_id is not null then
      update public.credit_card_statements set amount_paid = amount_paid + new.amount where id = new.statement_id;
    end if;
  elsif tg_op = 'DELETE' then
    update public.accounts       set current_balance      = current_balance + old.amount   where id = old.from_account_id;
    update public.credit_cards   set current_outstanding  = current_outstanding + old.amount where id = old.card_id;
    if old.statement_id is not null then
      update public.credit_card_statements set amount_paid = greatest(amount_paid - old.amount, 0) where id = old.statement_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_cc_payment
  after insert or delete on public.credit_card_payments
  for each row execute function public.apply_cc_payment();

-- ============================================================================
-- 8. BUDGETS
-- ============================================================================
create table public.budgets (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  month date not null,                    -- always the 1st of the month
  total_limit numeric(14,2) check (total_limit is null or total_limit >= 0),
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, month)
);
create index idx_budgets_family on public.budgets(family_id);

create table public.budget_categories (
  id uuid primary key default uuid_generate_v4(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  category_key text not null,
  limit_amount numeric(14,2) not null check (limit_amount >= 0),
  unique (budget_id, category_key)
);
create index idx_budget_categories_budget on public.budget_categories(budget_id);

-- ============================================================================
-- 9. BILLS & RECURRING PAYMENTS
-- ============================================================================
create table public.bills (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  amount numeric(14,2) not null check (amount >= 0),
  category_key text not null default 'other',   -- rent, electricity, gas, water, internet, mobile, school_fees, insurance, loan_emi, credit_card_bill, dps, other
  frequency recurring_frequency not null default 'monthly',
  next_due_date date not null,
  payment_account_id uuid references public.accounts(id) on delete set null,
  reminder_days_before smallint not null default 3 check (reminder_days_before >= 0),
  is_active boolean not null default true,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_bills_family on public.bills(family_id);
create index idx_bills_due on public.bills(next_due_date);

create table public.bill_payments (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null default current_date,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index idx_bill_payments_family on public.bill_payments(family_id);
create index idx_bill_payments_bill on public.bill_payments(bill_id);

create or replace function public.apply_bill_payment()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.account_id is not null then
      update public.accounts set current_balance = current_balance - new.amount where id = new.account_id;
    end if;
    update public.bills
      set next_due_date = public.advance_date(next_due_date, frequency)
      where id = new.bill_id and next_due_date <= new.paid_on;
  elsif tg_op = 'DELETE' then
    if old.account_id is not null then
      update public.accounts set current_balance = current_balance + old.amount where id = old.account_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_bill_payment
  after insert or delete on public.bill_payments
  for each row execute function public.apply_bill_payment();

-- ============================================================================
-- 10. LOANS & DEBT
-- ============================================================================
create table public.loans (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  type loan_type not null default 'personal',
  lender text not null,
  principal numeric(14,2) not null check (principal >= 0),
  interest_rate numeric(6,2) not null default 0,
  emi_amount numeric(14,2) not null default 0 check (emi_amount >= 0),
  tenure_months smallint check (tenure_months is null or tenure_months > 0),
  start_date date not null default current_date,
  end_date date,
  outstanding_balance numeric(14,2) not null default 0 check (outstanding_balance >= 0),
  is_closed boolean not null default false,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_loans_family on public.loans(family_id);

create table public.loan_payments (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  principal_component numeric(14,2) check (principal_component is null or principal_component >= 0),
  interest_component numeric(14,2) check (interest_component is null or interest_component >= 0),
  paid_on date not null default current_date,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index idx_loan_payments_family on public.loan_payments(family_id);
create index idx_loan_payments_loan on public.loan_payments(loan_id);

create or replace function public.apply_loan_payment()
returns trigger language plpgsql as $$
declare reduce numeric(14,2);
begin
  if tg_op = 'INSERT' then
    reduce := coalesce(new.principal_component, new.amount);
    if new.account_id is not null then
      update public.accounts set current_balance = current_balance - new.amount where id = new.account_id;
    end if;
    update public.loans
      set outstanding_balance = greatest(outstanding_balance - reduce, 0),
          is_closed = (greatest(outstanding_balance - reduce, 0) = 0)
      where id = new.loan_id;
  elsif tg_op = 'DELETE' then
    reduce := coalesce(old.principal_component, old.amount);
    if old.account_id is not null then
      update public.accounts set current_balance = current_balance + old.amount where id = old.account_id;
    end if;
    update public.loans
      set outstanding_balance = outstanding_balance + reduce,
          is_closed = false
      where id = old.loan_id;
  end if;
  return null;
end;
$$;

create trigger trg_loan_payment
  after insert or delete on public.loan_payments
  for each row execute function public.apply_loan_payment();

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create trigger trg_credit_cards_updated_at before update on public.credit_cards
  for each row execute function public.set_updated_at();
create trigger trg_cc_txn_updated_at before update on public.credit_card_transactions
  for each row execute function public.set_updated_at();
create trigger trg_cc_stmt_updated_at before update on public.credit_card_statements
  for each row execute function public.set_updated_at();
create trigger trg_cc_emi_updated_at before update on public.credit_card_emi
  for each row execute function public.set_updated_at();
create trigger trg_budgets_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();
create trigger trg_bills_updated_at before update on public.bills
  for each row execute function public.set_updated_at();
create trigger trg_loans_updated_at before update on public.loans
  for each row execute function public.set_updated_at();

-- ============================================================================
-- UNIFIED SPEND VIEW  (cash expenses + credit-card purchases)
-- Used by dashboards / reports so credit-card spending is not invisible.
-- ============================================================================
create or replace view public.v_unified_spend as
  select
    e.id,
    e.family_id,
    e.occurred_on,
    e.amount,
    e.category_key,
    e.merchant,
    e.person_id,
    'cash'::text as source,
    null::uuid   as card_id
  from public.expenses e
  union all
  select
    t.id,
    t.family_id,
    t.occurred_on,
    t.amount * public.cc_txn_sign(t.type) as amount,
    t.category_key,
    t.merchant,
    t.person_id,
    'credit_card'::text as source,
    t.card_id
  from public.credit_card_transactions t
  where t.type not in ('interest', 'fee');  -- financing costs, not category spend

alter view public.v_unified_spend set (security_invoker = on);
grant select on public.v_unified_spend to authenticated;

-- ============================================================================
-- FINANCIAL NOTIFICATION GENERATOR
-- Idempotent: dedupe_key prevents duplicates. Call from the app (RPC) on load.
-- ============================================================================
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists dedupe_key text;
-- plain (non-partial) unique index: many NULL dedupe_keys are allowed since
-- NULL <> NULL, so milestone-1 notifications are unaffected.
create unique index if not exists uq_notifications_dedupe
  on public.notifications(user_id, dedupe_key);

create or replace function public.refresh_statement_statuses()
returns void language sql as $$
  update public.credit_card_statements
    set status = 'overdue'
    where status in ('unpaid', 'partially_paid')
      and due_date < current_date;
$$;

-- Insert one notification unless an identical dedupe_key already exists for
-- this user. Returns 1 if a row was created, else 0.
create or replace function public._push_notification(
  p_family uuid, p_user uuid, p_type notification_type,
  p_title text, p_body text, p_link text, p_key text
) returns int language plpgsql as $$
begin
  insert into public.notifications (family_id, user_id, type, title, body, link, dedupe_key)
  values (p_family, p_user, p_type, p_title, p_body, p_link, p_key)
  on conflict (user_id, dedupe_key) do nothing;
  if found then return 1; else return 0; end if;
end;
$$;

create or replace function public.generate_financial_notifications(fam uuid)
returns integer
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  inserted integer := 0;
  r record;
  spent numeric;
begin
  if uid is null or not public.is_family_member(fam) then
    return 0;
  end if;

  perform public.refresh_statement_statuses();

  -- Credit-card statements: due soon / overdue / minimum payment
  for r in
    select s.*, c.card_name, c.provider
    from public.credit_card_statements s
    join public.credit_cards c on c.id = s.card_id
    where s.family_id = fam and s.status in ('unpaid', 'partially_paid', 'overdue')
  loop
    if r.status = 'overdue' then
      inserted := inserted + public._push_notification(fam, uid, 'credit_card_overdue',
        r.provider || ' ' || r.card_name || ' bill overdue',
        'Statement ৳' || r.statement_balance || ' was due ' || to_char(r.due_date, 'DD Mon') || '. Remaining ৳' || r.remaining_dues || '.',
        '/credit-cards/' || r.card_id, 'ccstmt:overdue:' || r.id);
    elsif r.due_date <= current_date + 5 then
      inserted := inserted + public._push_notification(fam, uid, 'credit_card_due',
        r.provider || ' ' || r.card_name || ' bill due ' || to_char(r.due_date, 'DD Mon'),
        'Statement ৳' || r.statement_balance || ', minimum ৳' || r.minimum_payment || '.',
        '/credit-cards/' || r.card_id, 'ccstmt:due:' || r.id || ':' || to_char(r.due_date, 'YYYYMMDD'));
    end if;

    if r.minimum_payment > 0 and r.amount_paid < r.minimum_payment
       and r.due_date <= current_date + 3 and r.status <> 'overdue' then
      inserted := inserted + public._push_notification(fam, uid, 'minimum_payment',
        'Minimum payment due: ' || r.provider || ' ' || r.card_name,
        'Pay at least ৳' || r.minimum_payment || ' by ' || to_char(r.due_date, 'DD Mon') || ' to avoid late fees.',
        '/credit-cards/' || r.card_id, 'ccstmt:min:' || r.id);
    end if;
  end loop;

  -- Bills due within their reminder window
  for r in
    select * from public.bills
    where family_id = fam and is_active
      and next_due_date <= current_date + reminder_days_before
  loop
    inserted := inserted + public._push_notification(fam, uid, 'bill_reminder',
      r.name || ' due ' || to_char(r.next_due_date, 'DD Mon'),
      '৳' || r.amount || ' — ' || r.frequency || ' bill.',
      '/bills', 'bill:' || r.id || ':' || to_char(r.next_due_date, 'YYYYMMDD'));
  end loop;

  -- Loan EMI due (approx: EMI day = start_date day, this month)
  for r in
    select * from public.loans
    where family_id = fam and not is_closed and emi_amount > 0
  loop
    if (make_date(extract(year from current_date)::int, extract(month from current_date)::int,
                  least(extract(day from r.start_date)::int, 28))) between current_date and current_date + 5 then
      inserted := inserted + public._push_notification(fam, uid, 'loan_payment_due',
        r.lender || ' EMI due soon',
        '৳' || r.emi_amount || ' — outstanding ৳' || r.outstanding_balance || '.',
        '/loans', 'loan:' || r.id || ':' || to_char(current_date, 'YYYYMM'));
    end if;
  end loop;

  -- Budget alerts (80 / 90 / 100 %)
  for r in
    select bc.category_key, bc.limit_amount, b.month
    from public.budget_categories bc
    join public.budgets b on b.id = bc.budget_id
    where b.family_id = fam
      and b.month = date_trunc('month', current_date)::date
      and bc.limit_amount > 0
  loop
    select coalesce(sum(amount), 0) into spent
    from public.v_unified_spend
    where family_id = fam
      and category_key = r.category_key
      and occurred_on >= r.month
      and occurred_on < (r.month + interval '1 month');

    if spent >= r.limit_amount then
      inserted := inserted + public._push_notification(fam, uid, 'budget_alert',
        'Budget exceeded: ' || r.category_key,
        'Spent ৳' || round(spent) || ' of ৳' || r.limit_amount || ' this month.',
        '/budget', 'budget:100:' || r.category_key || ':' || to_char(r.month, 'YYYYMM'));
    elsif spent >= r.limit_amount * 0.9 then
      inserted := inserted + public._push_notification(fam, uid, 'budget_alert',
        'Budget 90% used: ' || r.category_key,
        'Spent ৳' || round(spent) || ' of ৳' || r.limit_amount || '.',
        '/budget', 'budget:90:' || r.category_key || ':' || to_char(r.month, 'YYYYMM'));
    elsif spent >= r.limit_amount * 0.8 then
      inserted := inserted + public._push_notification(fam, uid, 'budget_alert',
        'Budget 80% used: ' || r.category_key,
        'Spent ৳' || round(spent) || ' of ৳' || r.limit_amount || '.',
        '/budget', 'budget:80:' || r.category_key || ':' || to_char(r.month, 'YYYYMM'));
    end if;
  end loop;

  return inserted;
end;
$$;

grant execute on function public.generate_financial_notifications(uuid) to authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.credit_cards               enable row level security;
alter table public.credit_card_transactions   enable row level security;
alter table public.credit_card_statements     enable row level security;
alter table public.credit_card_payments       enable row level security;
alter table public.credit_card_emi            enable row level security;
alter table public.budgets                    enable row level security;
alter table public.budget_categories          enable row level security;
alter table public.bills                      enable row level security;
alter table public.bill_payments              enable row level security;
alter table public.loans                      enable row level security;
alter table public.loan_payments              enable row level security;

-- Family-scoped tables: any active member can read & write; admins can delete.
do $$
declare t text;
begin
  foreach t in array array[
    'credit_cards', 'credit_card_transactions', 'credit_card_statements',
    'credit_card_payments', 'credit_card_emi', 'budgets',
    'bills', 'bill_payments', 'loans', 'loan_payments'
  ]
  loop
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_family_member(family_id));', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_family_member(family_id));', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_family_member(family_id));', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_family_member(family_id));', t);
  end loop;
end $$;

-- budget_categories: gate through the parent budget's family
create policy budget_categories_all on public.budget_categories
  for all using (
    exists (select 1 from public.budgets b where b.id = budget_id and public.is_family_member(b.family_id))
  )
  with check (
    exists (select 1 from public.budgets b where b.id = budget_id and public.is_family_member(b.family_id))
  );

-- ============================================================================
-- SEED: bill category helper rows (expense-side, so budgets can target them)
-- ============================================================================
insert into public.categories (type, parent_key, key, label, is_system) values
  ('expense', 'bills', 'school_fees', 'School Fees', true),
  ('expense', 'bills', 'insurance', 'Insurance', true),
  ('expense', 'bills', 'dps', 'DPS / Savings Scheme', true),
  ('expense', 'bills', 'loan_emi', 'Loan EMI', true),
  ('expense', 'bills', 'credit_card_bill', 'Credit Card Bill', true)
on conflict do nothing;

-- ============================================================================
-- Backfill profile rows for any auth users created before this schema existed
-- ============================================================================
insert into public.profiles (id, full_name)
select id, coalesce(raw_user_meta_data->>'full_name', '')
from auth.users
on conflict (id) do nothing;

-- Refresh PostgREST so the new tables/policies are served immediately
notify pgrst, 'reload schema';


-- ============================================================================
-- MILESTONE 3 — Savings, Investments, Assets, Net Worth, Remittance,
--               Reports, Shared Expenses, Family Events, Receipts
-- Builds on 0001 + 0002. Adds:
--   savings_goals, savings_contributions, investments, assets,
--   net_worth_snapshots, remittances, expense_splits, family_events, receipts
--   + expenses.event_id column
--   + capture_net_worth() function
--   + a private 'receipts' Storage bucket with family-scoped policies
--
-- ACCOUNTING NOTES:
--   * A savings contribution only advances the goal's current_amount. It does
--     not move real money (the cash still sits in a real account) — use a
--     transfer for that. Keeps goals a pure earmark / progress view.
--   * A remittance creates a normal income row (category 'remittance', which
--     credits the receiving account via the existing income trigger) plus a
--     `remittances` detail row holding the FX breakdown.
--   * Family-event spending is normal expenses tagged with event_id — no
--     separate ledger, so it still shows in every report and category chart.
-- ============================================================================

set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
create type savings_goal_type as enum (
  'emergency_fund', 'laptop', 'car', 'house', 'education', 'vacation',
  'wedding', 'eid', 'hajj_umrah', 'custom'
);

create type investment_type as enum (
  'dps', 'fdr', 'stocks', 'mutual_funds', 'gold', 'other'
);

create type asset_type as enum (
  'house', 'land', 'car', 'motorcycle', 'gold', 'electronics', 'other'
);

create type family_event_type as enum (
  'eid', 'ramadan', 'wedding', 'birthday', 'vacation', 'family_gathering', 'other'
);

-- ----------------------------------------------------------------------------
-- SHARED HELPER: exception-safe text -> uuid (used by Storage policies)
-- ----------------------------------------------------------------------------
create or replace function public.safe_uuid(t text)
returns uuid language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

-- ============================================================================
-- 1. SAVINGS GOALS
-- ============================================================================
create table public.savings_goals (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  goal_type savings_goal_type not null default 'custom',
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  target_date date,
  account_id uuid references public.accounts(id) on delete set null,
  notes text,
  is_achieved boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_savings_goals_family on public.savings_goals(family_id);

create table public.savings_contributions (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  contributed_on date not null default current_date,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index idx_savings_contrib_family on public.savings_contributions(family_id);
create index idx_savings_contrib_goal on public.savings_contributions(goal_id);

create or replace function public.apply_savings_contribution()
returns trigger language plpgsql as $$
declare delta numeric(14,2);
begin
  if tg_op = 'INSERT' then delta := new.amount;
  elsif tg_op = 'DELETE' then delta := -old.amount;
  elsif tg_op = 'UPDATE' then delta := new.amount - old.amount;
  end if;

  update public.savings_goals g
    set current_amount = greatest(g.current_amount + delta, 0),
        is_achieved = (greatest(g.current_amount + delta, 0) >= g.target_amount)
    where g.id = coalesce(new.goal_id, old.goal_id);

  return null;
end;
$$;

create trigger trg_savings_contribution
  after insert or update or delete on public.savings_contributions
  for each row execute function public.apply_savings_contribution();

-- ============================================================================
-- 3. INVESTMENTS
-- ============================================================================
create table public.investments (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  type investment_type not null default 'other',
  initial_amount numeric(14,2) not null check (initial_amount >= 0),
  current_value numeric(14,2) not null check (current_value >= 0),
  started_on date not null default current_date,
  owner_member_id uuid references public.family_members(id) on delete set null,
  notes text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_investments_family on public.investments(family_id);

-- ============================================================================
-- 4. ASSETS
-- ============================================================================
create table public.assets (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  asset_type asset_type not null default 'other',
  purchase_value numeric(14,2) not null check (purchase_value >= 0),
  current_value numeric(14,2) not null check (current_value >= 0),
  purchase_date date,
  owner_member_id uuid references public.family_members(id) on delete set null,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_assets_family on public.assets(family_id);

-- ============================================================================
-- 5. NET WORTH SNAPSHOTS
-- ============================================================================
create table public.net_worth_snapshots (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  captured_on date not null default current_date,
  cash_bank numeric(16,2) not null default 0,
  investments numeric(16,2) not null default 0,
  assets numeric(16,2) not null default 0,
  loans numeric(16,2) not null default 0,
  credit_card_outstanding numeric(16,2) not null default 0,
  total_assets numeric(16,2) not null default 0,
  total_liabilities numeric(16,2) not null default 0,
  net_worth numeric(16,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (family_id, captured_on)
);
create index idx_nws_family on public.net_worth_snapshots(family_id);

create or replace function public.capture_net_worth(fam uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_cash numeric(16,2); v_inv numeric(16,2); v_assets numeric(16,2);
  v_loans numeric(16,2); v_cc numeric(16,2); v_id uuid;
begin
  if auth.uid() is null or not public.is_family_member(fam) then
    return null;
  end if;

  select coalesce(sum(current_balance), 0) into v_cash
    from public.accounts where family_id = fam and not is_archived;
  select coalesce(sum(current_value), 0) into v_inv
    from public.investments where family_id = fam and is_active;
  select coalesce(sum(current_value), 0) into v_assets
    from public.assets where family_id = fam;
  select coalesce(sum(outstanding_balance), 0) into v_loans
    from public.loans where family_id = fam and not is_closed;
  select coalesce(sum(current_outstanding), 0) into v_cc
    from public.credit_cards where family_id = fam and not is_archived;

  insert into public.net_worth_snapshots (
    family_id, captured_on, cash_bank, investments, assets, loans,
    credit_card_outstanding, total_assets, total_liabilities, net_worth
  ) values (
    fam, current_date, v_cash, v_inv, v_assets, v_loans, v_cc,
    v_cash + v_inv + v_assets,
    v_loans + v_cc,
    (v_cash + v_inv + v_assets) - (v_loans + v_cc)
  )
  on conflict (family_id, captured_on) do update set
    cash_bank = excluded.cash_bank,
    investments = excluded.investments,
    assets = excluded.assets,
    loans = excluded.loans,
    credit_card_outstanding = excluded.credit_card_outstanding,
    total_assets = excluded.total_assets,
    total_liabilities = excluded.total_liabilities,
    net_worth = excluded.net_worth
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.capture_net_worth(uuid) to authenticated;

-- ============================================================================
-- 6. REMITTANCES  (FX detail attached to an income row)
-- ============================================================================
create table public.remittances (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  income_id uuid not null references public.income(id) on delete cascade,
  sender_name text not null,
  country text not null,
  foreign_currency text not null,
  foreign_amount numeric(16,2) not null check (foreign_amount > 0),
  exchange_rate numeric(12,4) not null check (exchange_rate > 0),
  notes text,
  created_at timestamptz not null default now()
);
create index idx_remittances_family on public.remittances(family_id);

-- ============================================================================
-- 10. SHARED EXPENSE SPLITS
-- ============================================================================
create table public.expense_splits (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid references public.family_members(id) on delete set null,
  member_label text,                       -- fallback name if not a member
  share_amount numeric(14,2) not null check (share_amount >= 0),
  is_settled boolean not null default false,
  settled_on date,
  created_at timestamptz not null default now()
);
create index idx_expense_splits_family on public.expense_splits(family_id);
create index idx_expense_splits_expense on public.expense_splits(expense_id);

-- ============================================================================
-- 11. FAMILY EVENTS  (event budgets; spend = expenses tagged with event_id)
-- ============================================================================
create table public.family_events (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  event_type family_event_type not null default 'other',
  budget_amount numeric(14,2) not null default 0 check (budget_amount >= 0),
  event_date date,
  notes text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_family_events_family on public.family_events(family_id);

alter table public.expenses
  add column if not exists event_id uuid references public.family_events(id) on delete set null;
create index if not exists idx_expenses_event on public.expenses(event_id);

-- ============================================================================
-- 13. RECEIPTS  (metadata; files live in the 'receipts' Storage bucket)
-- ============================================================================
create table public.receipts (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  entity_type text not null default 'general'
    check (entity_type in ('expense','income','credit_card_transaction','bill_payment',
                           'loan_payment','remittance','investment','asset','general')),
  entity_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index idx_receipts_family on public.receipts(family_id);
create index idx_receipts_entity on public.receipts(entity_type, entity_id);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create trigger trg_savings_goals_updated_at before update on public.savings_goals
  for each row execute function public.set_updated_at();
create trigger trg_investments_updated_at before update on public.investments
  for each row execute function public.set_updated_at();
create trigger trg_assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();
create trigger trg_family_events_updated_at before update on public.family_events
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY  (family members read+write; same model as milestone 2)
-- ============================================================================
alter table public.savings_goals          enable row level security;
alter table public.savings_contributions  enable row level security;
alter table public.investments            enable row level security;
alter table public.assets                 enable row level security;
alter table public.net_worth_snapshots    enable row level security;
alter table public.remittances            enable row level security;
alter table public.expense_splits         enable row level security;
alter table public.family_events          enable row level security;
alter table public.receipts               enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'savings_goals', 'savings_contributions', 'investments', 'assets',
    'net_worth_snapshots', 'remittances', 'expense_splits', 'family_events', 'receipts'
  ]
  loop
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s;', t);
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_family_member(family_id));', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_family_member(family_id));', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_family_member(family_id));', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_family_member(family_id));', t);
  end loop;
end $$;

-- ============================================================================
-- STORAGE: private 'receipts' bucket + family-scoped object policies
-- Path convention enforced by the app: <family_id>/<uuid>-<filename>
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipts_object_select" on storage.objects;
drop policy if exists "receipts_object_insert" on storage.objects;
drop policy if exists "receipts_object_update" on storage.objects;
drop policy if exists "receipts_object_delete" on storage.objects;

create policy "receipts_object_select" on storage.objects for select to authenticated
  using (bucket_id = 'receipts'
         and public.is_family_member(public.safe_uuid((storage.foldername(name))[1])));
create policy "receipts_object_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts'
             and public.is_family_member(public.safe_uuid((storage.foldername(name))[1])));
create policy "receipts_object_update" on storage.objects for update to authenticated
  using (bucket_id = 'receipts'
         and public.is_family_member(public.safe_uuid((storage.foldername(name))[1])));
create policy "receipts_object_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts'
         and public.is_family_member(public.safe_uuid((storage.foldername(name))[1])));

notify pgrst, 'reload schema';


-- ============================================================================
-- MILESTONE 4 — Localization, PWA, Security, Performance & Production Release
-- Builds on 0001 + 0002 + 0003. Adds:
--   * soft-delete (Trash) for expenses / income / transfers
--   * balance triggers rewritten to be soft-delete aware (idempotent add/remove)
--   * automatic human-readable audit logging on all core tables
--   * profile prefs: language, theme
--   * a few composite indexes for the common family-scoped, dated queries
--
-- ACCOUNTING INVARIANT (Milestone 4 §18) is preserved:
--   credit-card purchase  -> card outstanding up,  no cash account touched
--   credit-card payment   -> paying account down + card outstanding down,
--                            NEVER written to expenses (no double count)
--   soft-deleting an expense reverses its account effect; restoring re-applies.
-- ============================================================================

set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- PROFILE PREFERENCES
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists language text not null default 'en'
  check (language in ('en', 'bn'));
alter table public.profiles add column if not exists theme text not null default 'system'
  check (theme in ('light', 'dark', 'system'));
alter table public.profiles add column if not exists notification_prefs jsonb not null default
  '{"cc_due":true,"cc_overdue":true,"bills":true,"loans":true,"budget":true,"savings":true,"browser":false}'::jsonb;

-- ----------------------------------------------------------------------------
-- SOFT DELETE (Trash / recovery, §9) — transactions only
-- ----------------------------------------------------------------------------
alter table public.expenses  add column if not exists deleted_at timestamptz;
alter table public.expenses  add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.income    add column if not exists deleted_at timestamptz;
alter table public.income    add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.transfers add column if not exists deleted_at timestamptz;
alter table public.transfers add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists idx_expenses_not_deleted  on public.expenses(family_id, occurred_on) where deleted_at is null;
create index if not exists idx_income_not_deleted     on public.income(family_id, occurred_on)   where deleted_at is null;
create index if not exists idx_transfers_not_deleted  on public.transfers(family_id, occurred_on) where deleted_at is null;
create index if not exists idx_expenses_trash on public.expenses(family_id, deleted_at) where deleted_at is not null;
create index if not exists idx_income_trash   on public.income(family_id, deleted_at)   where deleted_at is not null;
create index if not exists idx_transfers_trash on public.transfers(family_id, deleted_at) where deleted_at is not null;

-- ----------------------------------------------------------------------------
-- BALANCE TRIGGERS — soft-delete aware. "Remove old effect if it was active,
-- add new effect if it is active." Handles insert / edit / soft-delete /
-- restore / hard-delete uniformly.
-- ----------------------------------------------------------------------------
create or replace function public.apply_income_balance()
returns trigger language plpgsql as $$
declare
  old_active boolean := (tg_op <> 'INSERT') and (old.deleted_at is null);
  new_active boolean := (tg_op <> 'DELETE') and (new.deleted_at is null);
begin
  if old_active then
    update public.accounts set current_balance = current_balance - old.amount where id = old.account_id;
  end if;
  if new_active then
    update public.accounts set current_balance = current_balance + new.amount where id = new.account_id;
  end if;
  return null;
end;
$$;

create or replace function public.apply_expense_balance()
returns trigger language plpgsql as $$
declare
  old_active boolean := (tg_op <> 'INSERT') and (old.deleted_at is null);
  new_active boolean := (tg_op <> 'DELETE') and (new.deleted_at is null);
begin
  if old_active then
    update public.accounts set current_balance = current_balance + old.amount where id = old.account_id;
  end if;
  if new_active then
    update public.accounts set current_balance = current_balance - new.amount where id = new.account_id;
  end if;
  return null;
end;
$$;

create or replace function public.apply_transfer_balance()
returns trigger language plpgsql as $$
declare
  old_active boolean := (tg_op <> 'INSERT') and (old.deleted_at is null);
  new_active boolean := (tg_op <> 'DELETE') and (new.deleted_at is null);
begin
  if old_active then
    update public.accounts set current_balance = current_balance + old.amount where id = old.from_account_id;
    update public.accounts set current_balance = current_balance - old.amount where id = old.to_account_id;
  end if;
  if new_active then
    update public.accounts set current_balance = current_balance - new.amount where id = new.from_account_id;
    update public.accounts set current_balance = current_balance + new.amount where id = new.to_account_id;
  end if;
  return null;
end;
$$;

-- transfers only fired on insert/delete before — needs update too, for trash
drop trigger if exists trg_transfer_balance on public.transfers;
create trigger trg_transfer_balance
  after insert or update or delete on public.transfers
  for each row execute function public.apply_transfer_balance();

-- Exclude trashed expenses from the unified spend view (budgets / analytics)
create or replace view public.v_unified_spend as
  select
    e.id, e.family_id, e.occurred_on, e.amount, e.category_key, e.merchant,
    e.person_id, 'cash'::text as source, null::uuid as card_id
  from public.expenses e
  where e.deleted_at is null
  union all
  select
    t.id, t.family_id, t.occurred_on, t.amount * public.cc_txn_sign(t.type) as amount,
    t.category_key, t.merchant, t.person_id, 'credit_card'::text as source, t.card_id
  from public.credit_card_transactions t
  where t.type not in ('interest', 'fee');
alter view public.v_unified_spend set (security_invoker = on);
grant select on public.v_unified_spend to authenticated;

-- ----------------------------------------------------------------------------
-- AUDIT LOGGING (§7) — automatic, human-readable, tamper-resistant.
-- Client code never writes audit_logs directly (no INSERT policy); this
-- SECURITY DEFINER trigger is the only writer.
-- ----------------------------------------------------------------------------
create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
as $$
declare
  entity    text := tg_argv[0];
  newj jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  oldj jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  rec  jsonb := coalesce(newj, oldj);
  fam  uuid  := nullif(rec->>'family_id', '')::uuid;
  actor text;
  verb  text;
  amt   numeric;
  label text;
  msg   text;
begin
  if fam is null then return null; end if;

  select fm.display_name into actor
    from public.family_members fm
    where fm.user_id = auth.uid() and fm.family_id = fam and fm.status = 'active'
    limit 1;
  if actor is null then
    select p.full_name into actor from public.profiles p where p.id = auth.uid();
  end if;
  actor := coalesce(nullif(actor, ''), 'Someone');

  amt := coalesce(
    nullif(rec->>'amount', '')::numeric,
    nullif(rec->>'statement_balance', '')::numeric,
    nullif(rec->>'budget_amount', '')::numeric,
    nullif(rec->>'target_amount', '')::numeric,
    nullif(rec->>'principal', '')::numeric
  );
  label := coalesce(
    nullif(rec->>'merchant', ''), nullif(rec->>'source', ''), nullif(rec->>'name', ''),
    nullif(rec->>'card_name', ''), nullif(rec->>'lender', ''),
    nullif(rec->>'category_key', ''), initcap(replace(entity, '_', ' '))
  );

  if tg_op = 'INSERT' then
    verb := 'added';
  elsif tg_op = 'DELETE' then
    verb := 'permanently deleted';
  elsif (oldj->>'deleted_at') is null and (newj->>'deleted_at') is not null then
    verb := 'moved to trash';
  elsif (oldj->>'deleted_at') is not null and (newj->>'deleted_at') is null then
    verb := 'restored';
  elsif entity = 'credit_card_statement'
        and coalesce(oldj->>'status','') <> 'paid' and (newj->>'status') = 'paid' then
    verb := 'marked paid';
  else
    verb := 'edited';
  end if;

  msg := actor || ' ' || verb || ' ' || replace(entity, '_', ' ')
         || case when label is not null and lower(label) <> replace(entity, '_', ' ')
                 then ' — ' || label else '' end
         || case when amt is not null then ' (৳' || trim(to_char(round(amt), 'FM999,999,999')) || ')' else '' end;

  insert into public.audit_logs (family_id, actor_id, action, entity_type, entity_id, metadata)
  values (fam, auth.uid(), msg, entity, nullif(rec->>'id', '')::uuid,
          jsonb_build_object('op', tg_op, 'verb', verb));
  return null;
end;
$$;

do $$
declare
  m record;
begin
  for m in
    select * from (values
      ('accounts', 'account'),
      ('expenses', 'expense'),
      ('income', 'income'),
      ('transfers', 'transfer'),
      ('credit_cards', 'credit_card'),
      ('credit_card_transactions', 'credit_card_transaction'),
      ('credit_card_payments', 'credit_card_payment'),
      ('credit_card_statements', 'credit_card_statement'),
      ('credit_card_emi', 'credit_card_emi'),
      ('loans', 'loan'),
      ('loan_payments', 'loan_payment'),
      ('bills', 'bill'),
      ('bill_payments', 'bill_payment'),
      ('budgets', 'budget'),
      ('savings_goals', 'savings_goal'),
      ('savings_contributions', 'savings_contribution'),
      ('investments', 'investment'),
      ('assets', 'asset'),
      ('remittances', 'remittance'),
      ('family_events', 'family_event'),
      ('family_members', 'family_member')
    ) as t(tbl, label)
  loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s;', m.tbl);
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$s
       for each row execute function public.log_audit(%2$L);', m.tbl, m.label);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- PERFORMANCE — composite indexes for the hot paths
-- ----------------------------------------------------------------------------
create index if not exists idx_cc_txn_family_date on public.credit_card_transactions(family_id, occurred_on);
create index if not exists idx_cc_pay_family_date on public.credit_card_payments(family_id, occurred_on);
create index if not exists idx_loan_pay_family_date on public.loan_payments(family_id, paid_on);
create index if not exists idx_bill_pay_family_date on public.bill_payments(family_id, paid_on);
create index if not exists idx_savings_contrib_family_date on public.savings_contributions(family_id, contributed_on);
create index if not exists idx_audit_logs_family_created on public.audit_logs(family_id, created_at desc);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- TRASH PURGE — permanently remove transactions trashed > 30 days ago.
-- Call from the app (RPC) or a scheduled job.
-- ----------------------------------------------------------------------------
create or replace function public.purge_trash(fam uuid, older_than_days int default 30)
returns integer
language plpgsql
security definer
as $$
declare
  cutoff timestamptz := now() - make_interval(days => older_than_days);
  n integer := 0;
  c integer;
begin
  if auth.uid() is null or not public.is_family_member(fam) then
    return 0;
  end if;
  delete from public.expenses  where family_id = fam and deleted_at is not null and deleted_at < cutoff;
  get diagnostics c = row_count; n := n + c;
  delete from public.income    where family_id = fam and deleted_at is not null and deleted_at < cutoff;
  get diagnostics c = row_count; n := n + c;
  delete from public.transfers where family_id = fam and deleted_at is not null and deleted_at < cutoff;
  get diagnostics c = row_count; n := n + c;
  return n;
end;
$$;
grant execute on function public.purge_trash(uuid, int) to authenticated;

notify pgrst, 'reload schema';


-- ============================================================================
-- MILESTONE 4b — Real family invitations (shareable join link + accept flow)
-- ============================================================================

set check_function_bodies = off;

alter table public.family_members
  add column if not exists invite_token uuid default uuid_generate_v4(),
  add column if not exists invite_expires_at timestamptz;

-- backfill tokens for any existing pending invites
update public.family_members
  set invite_token = uuid_generate_v4()
  where status = 'invited' and invite_token is null;

create index if not exists idx_family_members_invite_token
  on public.family_members(invite_token) where invite_token is not null;

-- ----------------------------------------------------------------------------
-- accept_family_invite(token) — called by a signed-in user from /join/<token>.
-- SECURITY DEFINER because the invitee is not a family member yet, so RLS
-- would hide the row. Links the pending row to auth.uid() and activates it.
-- ----------------------------------------------------------------------------
create or replace function public.accept_family_invite(token uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  inv public.family_members;
  existing public.family_members;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into inv from public.family_members
    where invite_token = token
      and status = 'invited'
      and (invite_expires_at is null or invite_expires_at > now())
    limit 1;

  if inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  select * into existing from public.family_members
    where family_id = inv.family_id and user_id = auth.uid()
    limit 1;

  if existing.id is not null then
    if existing.status <> 'active' then
      update public.family_members set status = 'active' where id = existing.id;
    end if;
    delete from public.family_members where id = inv.id;
    return jsonb_build_object('ok', true, 'family_id', inv.family_id, 'already_member', true);
  end if;

  update public.family_members
    set user_id = auth.uid(),
        status = 'active',
        invite_token = null,
        invite_expires_at = null
    where id = inv.id;

  return jsonb_build_object('ok', true, 'family_id', inv.family_id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'conflict');
end;
$$;

grant execute on function public.accept_family_invite(uuid) to authenticated;

-- Preview an invite (family + inviter name) without joining — for the /join page.
create or replace function public.peek_family_invite(token uuid)
returns jsonb
language plpgsql
security definer
as $$
declare r record;
begin
  select f.name as family_name, fm.role, fm.display_name,
         coalesce(ib.full_name, 'A family member') as invited_by
    into r
  from public.family_members fm
  join public.families f on f.id = fm.family_id
  left join public.profiles ib on ib.id = fm.invited_by
  where fm.invite_token = token
    and fm.status = 'invited'
    and (fm.invite_expires_at is null or fm.invite_expires_at > now())
  limit 1;

  if r.family_name is null then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'family_name', r.family_name,
                            'role', r.role, 'invited_by', r.invited_by);
end;
$$;

grant execute on function public.peek_family_invite(uuid) to authenticated, anon;

notify pgrst, 'reload schema';
