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
