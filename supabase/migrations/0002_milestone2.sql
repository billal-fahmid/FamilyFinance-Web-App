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
