-- ============================================================================
-- FamFinance — optional demo data for a Bangladeshi family.
--
--   1. Run:  select id, name from public.families;
--   2. Paste that family's id into v_fam below (replace the placeholder).
--   3. Run this whole file in the Supabase SQL Editor.
--
-- Safe to run more than once — it only adds rows. Delete them with:
--   delete from public.expenses where family_id = '<id>' and notes = 'demo';
-- ============================================================================

do $$
declare
  v_fam  uuid := '00000000-0000-0000-0000-000000000000';  -- << EDIT THIS
  v_user uuid;
  v_owner uuid;
  v_spouse uuid;
  v_cash uuid; v_bank uuid; v_bkash uuid;
  v_card uuid;
  v_goal uuid;
  d date;
begin
  select created_by into v_user from public.families where id = v_fam;
  if v_user is null then
    raise exception 'Family % not found — set v_fam to a real id', v_fam;
  end if;

  -- members
  select id into v_owner from public.family_members where family_id = v_fam and role = 'owner' limit 1;
  insert into public.family_members (family_id, display_name, relationship, role, status)
    values (v_fam, 'Spouse', 'Spouse', 'member', 'active')
  returning id into v_spouse;

  -- accounts
  insert into public.accounts (family_id, name, type, opening_balance, current_balance)
    values (v_fam, 'Family Cash', 'cash', 8000, 8000) returning id into v_cash;
  insert into public.accounts (family_id, name, type, opening_balance, current_balance)
    values (v_fam, 'Dutch-Bangla Bank', 'bank', 120000, 120000) returning id into v_bank;
  insert into public.accounts (family_id, name, type, opening_balance, current_balance)
    values (v_fam, 'bKash', 'bkash', 3500, 3500) returning id into v_bkash;

  -- credit card
  insert into public.credit_cards (family_id, provider, card_name, last4, credit_limit,
      statement_day, due_day, interest_rate, annual_fee)
    values (v_fam, 'EBL', 'Visa Signature', '4821', 200000, 25, 15, 27.00, 3000)
  returning id into v_card;

  -- 3 months of income + expenses
  for i in 0..2 loop
    d := (date_trunc('month', current_date) - make_interval(months => i))::date;

    insert into public.income (family_id, account_id, person_id, category_key, amount, occurred_on, source, created_by)
      values (v_fam, v_bank, v_owner, 'salary', 85000, d + 1, 'Employer', v_user),
             (v_fam, v_bkash, v_spouse, 'freelancing', 18000, d + 12, 'Upwork', v_user);

    insert into public.expenses (family_id, account_id, person_id, category_key, amount, occurred_on, merchant, notes, created_by)
      values
        (v_fam, v_bank, v_owner, 'rent',        22000, d + 2,  'Landlord',     'demo', v_user),
        (v_fam, v_bank, v_owner, 'electricity',  2400, d + 8,  'DESCO',        'demo', v_user),
        (v_fam, v_bkash, v_owner, 'internet',    1200, d + 8,  'Link3',        'demo', v_user),
        (v_fam, v_cash, v_spouse, 'grocery',     9500, d + 5,  'Shwapno',      'demo', v_user),
        (v_fam, v_cash, v_spouse, 'grocery',     7200, d + 19, 'Agora',        'demo', v_user),
        (v_fam, v_cash, v_owner,  'cng',         1800, d + 10, 'CNG',          'demo', v_user),
        (v_fam, v_bkash, v_owner, 'mobile',       500, d + 3,  'Grameenphone', 'demo', v_user),
        (v_fam, v_cash, v_spouse, 'restaurant',  2600, d + 22, 'Sultan''s Dine','demo', v_user);

    -- a couple of credit-card purchases each month
    insert into public.credit_card_transactions (family_id, card_id, person_id, type, amount, occurred_on, merchant, category_key, created_by)
      values
        (v_fam, v_card, v_owner, 'online_purchase', 4300, d + 14, 'Daraz',   'shopping', v_user),
        (v_fam, v_card, v_owner, 'pos_purchase',    3100, d + 20, 'Aarong',  'clothes',  v_user);
  end loop;

  -- a card statement for last month + a partial payment
  insert into public.credit_card_statements (family_id, card_id, period_start, period_end, statement_date,
      statement_balance, minimum_payment, due_date)
    values (v_fam, v_card,
            (date_trunc('month', current_date) - interval '1 month')::date,
            (date_trunc('month', current_date) - interval '1 day')::date,
            (date_trunc('month', current_date) - interval '5 days')::date,
            14800, 750,
            (date_trunc('month', current_date) + interval '10 days')::date);
  insert into public.credit_card_payments (family_id, card_id, from_account_id, amount, created_by)
    values (v_fam, v_card, v_bank, 8000, v_user);

  -- budget for this month
  declare b uuid;
  begin
    insert into public.budgets (family_id, month, total_limit, created_by)
      values (v_fam, date_trunc('month', current_date)::date, 60000, v_user)
    on conflict (family_id, month) do update set total_limit = 60000
    returning id into b;
    insert into public.budget_categories (budget_id, category_key, limit_amount) values
      (b, 'grocery', 18000), (b, 'rent', 22000), (b, 'restaurant', 4000), (b, 'internet', 1500)
    on conflict do nothing;
  end;

  -- a bill, a loan, a savings goal, an asset
  insert into public.bills (family_id, name, amount, category_key, frequency, next_due_date, payment_account_id, created_by)
    values (v_fam, 'House Rent', 22000, 'rent', 'monthly',
            (date_trunc('month', current_date) + interval '1 month' + interval '1 day')::date, v_bank, v_user);

  insert into public.loans (family_id, type, lender, principal, interest_rate, emi_amount, tenure_months,
      start_date, outstanding_balance, created_by)
    values (v_fam, 'personal', 'BRAC Bank', 300000, 12.5, 14200, 24,
            (current_date - interval '4 months')::date, 245000, v_user);

  insert into public.savings_goals (family_id, name, goal_type, target_amount, current_amount, target_date, account_id, created_by)
    values (v_fam, 'Emergency Fund', 'emergency_fund', 200000, 85000,
            (current_date + interval '10 months')::date, v_bank, v_user)
  returning id into v_goal;
  insert into public.savings_contributions (family_id, goal_id, account_id, amount, created_by)
    values (v_fam, v_goal, v_bank, 10000, v_user);

  insert into public.investments (family_id, name, type, initial_amount, current_value, started_on, created_by)
    values (v_fam, 'DBBL DPS', 'dps', 60000, 66500, (current_date - interval '1 year')::date, v_user);
  insert into public.assets (family_id, name, asset_type, purchase_value, current_value, purchase_date, created_by)
    values (v_fam, 'Toyota Axio', 'car', 1850000, 1650000, (current_date - interval '3 years')::date, v_user);

  raise notice 'Demo data added for family %', v_fam;
end $$;
