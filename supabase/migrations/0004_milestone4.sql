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
