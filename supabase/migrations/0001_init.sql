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
