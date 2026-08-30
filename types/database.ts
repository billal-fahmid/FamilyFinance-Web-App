export type FamilyRole = 'owner' | 'admin' | 'member' | 'viewer';

export type AccountType =
  | 'cash' | 'bank' | 'bkash' | 'nagad' | 'rocket' | 'debit_card' | 'savings' | 'other';

export type TransactionScope = 'personal' | 'shared' | 'family';

export type RecurringFrequency =
  | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  default_family_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Family {
  id: string;
  name: string;
  currency: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string | null;
  invited_email: string | null;
  display_name: string;
  photo_url: string | null;
  relationship: string | null;
  role: FamilyRole;
  status: 'invited' | 'active' | 'removed';
  invited_by: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  family_id: string | null;
  type: 'income' | 'expense';
  parent_key: string | null;
  key: string;
  label: string;
  icon: string | null;
  is_system: boolean;
  created_at: string;
}

export interface Account {
  id: string;
  family_id: string;
  owner_member_id: string | null;
  name: string;
  type: AccountType;
  opening_balance: number;
  current_balance: number;
  masked_number: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface IncomeEntry {
  id: string;
  family_id: string;
  account_id: string;
  person_id: string | null;
  category_key: string;
  amount: number;
  occurred_on: string;
  source: string | null;
  notes: string | null;
  is_recurring: boolean;
  frequency: RecurringFrequency | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseEntry {
  id: string;
  family_id: string;
  account_id: string;
  person_id: string | null;
  category_key: string;
  subcategory_key: string | null;
  amount: number;
  occurred_on: string;
  merchant: string | null;
  notes: string | null;
  scope: TransactionScope;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Transfer {
  id: string;
  family_id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  occurred_on: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface Tag {
  id: string;
  family_id: string;
  name: string;
  color: string;
  created_at: string;
}

// ============================================================================
// MILESTONE 2 — Credit cards, statements, payments, EMI, budgets, bills, loans
// ============================================================================

export type CreditCardTxnType =
  | 'purchase' | 'online_purchase' | 'pos_purchase' | 'cash_advance'
  | 'fee' | 'interest' | 'refund' | 'emi_purchase' | 'adjustment';

export type StatementStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue';

export type LoanType = 'personal' | 'home' | 'car' | 'family' | 'other';

export interface CreditCard {
  id: string;
  family_id: string;
  owner_member_id: string | null;
  provider: string;
  card_name: string;
  cardholder_name: string | null;
  last4: string | null;
  credit_limit: number;
  current_outstanding: number;
  statement_balance: number;
  minimum_payment: number;
  statement_day: number | null;
  due_day: number | null;
  annual_fee: number;
  interest_rate: number;
  notes: string | null;
  is_archived: boolean;
  available_credit: number;
  created_at: string;
  updated_at: string;
}

export interface CreditCardTransaction {
  id: string;
  family_id: string;
  card_id: string;
  person_id: string | null;
  emi_id: string | null;
  type: CreditCardTxnType;
  amount: number;
  occurred_on: string;
  merchant: string | null;
  category_key: string | null;
  notes: string | null;
  receipt_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreditCardStatement {
  id: string;
  family_id: string;
  card_id: string;
  period_start: string;
  period_end: string;
  statement_date: string;
  statement_balance: number;
  minimum_payment: number;
  due_date: string;
  amount_paid: number;
  status: StatementStatus;
  notes: string | null;
  remaining_dues: number;
  created_at: string;
  updated_at: string;
}

export interface CreditCardPayment {
  id: string;
  family_id: string;
  card_id: string;
  statement_id: string | null;
  from_account_id: string;
  amount: number;
  occurred_on: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface CreditCardEmi {
  id: string;
  family_id: string;
  card_id: string;
  product: string;
  original_amount: number;
  down_payment: number;
  tenure_months: number;
  monthly_installment: number;
  interest_rate: number;
  start_date: string;
  end_date: string | null;
  installments_paid: number;
  notes: string | null;
  financed_amount: number;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  family_id: string;
  month: string;
  total_limit: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetCategory {
  id: string;
  budget_id: string;
  category_key: string;
  limit_amount: number;
}

export interface Bill {
  id: string;
  family_id: string;
  name: string;
  amount: number;
  category_key: string;
  frequency: RecurringFrequency;
  next_due_date: string;
  payment_account_id: string | null;
  reminder_days_before: number;
  is_active: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BillPayment {
  id: string;
  family_id: string;
  bill_id: string;
  account_id: string | null;
  amount: number;
  paid_on: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface Loan {
  id: string;
  family_id: string;
  type: LoanType;
  lender: string;
  principal: number;
  interest_rate: number;
  emi_amount: number;
  tenure_months: number | null;
  start_date: string;
  end_date: string | null;
  outstanding_balance: number;
  is_closed: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LoanPayment {
  id: string;
  family_id: string;
  loan_id: string;
  account_id: string | null;
  amount: number;
  principal_component: number | null;
  interest_component: number | null;
  paid_on: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  family_id: string | null;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  dedupe_key: string | null;
  is_read: boolean;
  created_at: string;
}

// ============================================================================
// MILESTONE 3 — Savings, investments, assets, net worth, remittance, events
// ============================================================================

export type SavingsGoalType =
  | 'emergency_fund' | 'laptop' | 'car' | 'house' | 'education' | 'vacation'
  | 'wedding' | 'eid' | 'hajj_umrah' | 'custom';

export type InvestmentType = 'dps' | 'fdr' | 'stocks' | 'mutual_funds' | 'gold' | 'other';

export type AssetType =
  | 'house' | 'land' | 'car' | 'motorcycle' | 'gold' | 'electronics' | 'other';

export type FamilyEventType =
  | 'eid' | 'ramadan' | 'wedding' | 'birthday' | 'vacation' | 'family_gathering' | 'other';

export type ReceiptEntityType =
  | 'expense' | 'income' | 'credit_card_transaction' | 'bill_payment'
  | 'loan_payment' | 'remittance' | 'investment' | 'asset' | 'general';

export interface SavingsGoal {
  id: string;
  family_id: string;
  name: string;
  goal_type: SavingsGoalType;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  account_id: string | null;
  notes: string | null;
  is_achieved: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SavingsContribution {
  id: string;
  family_id: string;
  goal_id: string;
  account_id: string | null;
  amount: number;
  contributed_on: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface Investment {
  id: string;
  family_id: string;
  name: string;
  type: InvestmentType;
  initial_amount: number;
  current_value: number;
  started_on: string;
  owner_member_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  family_id: string;
  name: string;
  asset_type: AssetType;
  purchase_value: number;
  current_value: number;
  purchase_date: string | null;
  owner_member_id: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface NetWorthSnapshot {
  id: string;
  family_id: string;
  captured_on: string;
  cash_bank: number;
  investments: number;
  assets: number;
  loans: number;
  credit_card_outstanding: number;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  created_at: string;
}

export interface Remittance {
  id: string;
  family_id: string;
  income_id: string;
  sender_name: string;
  country: string;
  foreign_currency: string;
  foreign_amount: number;
  exchange_rate: number;
  notes: string | null;
  created_at: string;
}

export interface ExpenseSplit {
  id: string;
  family_id: string;
  expense_id: string;
  member_id: string | null;
  member_label: string | null;
  share_amount: number;
  is_settled: boolean;
  settled_on: string | null;
  created_at: string;
}

export interface FamilyEvent {
  id: string;
  family_id: string;
  name: string;
  event_type: FamilyEventType;
  budget_amount: number;
  event_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Receipt {
  id: string;
  family_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  entity_type: ReceiptEntityType;
  entity_id: string | null;
  note: string | null;
  created_at: string;
}

// Minimal Supabase generated-types shape so the client stays type-safe
// without generating full types from a live project yet. Replace with
// `supabase gen types typescript` output once the project is linked.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      families: { Row: Family; Insert: Partial<Family>; Update: Partial<Family> };
      family_members: { Row: FamilyMember; Insert: Partial<FamilyMember>; Update: Partial<FamilyMember> };
      categories: { Row: Category; Insert: Partial<Category>; Update: Partial<Category> };
      accounts: { Row: Account; Insert: Partial<Account>; Update: Partial<Account> };
      income: { Row: IncomeEntry; Insert: Partial<IncomeEntry>; Update: Partial<IncomeEntry> };
      expenses: { Row: ExpenseEntry; Insert: Partial<ExpenseEntry>; Update: Partial<ExpenseEntry> };
      transfers: { Row: Transfer; Insert: Partial<Transfer>; Update: Partial<Transfer> };
      tags: { Row: Tag; Insert: Partial<Tag>; Update: Partial<Tag> };
      credit_cards: { Row: CreditCard; Insert: Partial<CreditCard>; Update: Partial<CreditCard> };
      credit_card_transactions: { Row: CreditCardTransaction; Insert: Partial<CreditCardTransaction>; Update: Partial<CreditCardTransaction> };
      credit_card_statements: { Row: CreditCardStatement; Insert: Partial<CreditCardStatement>; Update: Partial<CreditCardStatement> };
      credit_card_payments: { Row: CreditCardPayment; Insert: Partial<CreditCardPayment>; Update: Partial<CreditCardPayment> };
      credit_card_emi: { Row: CreditCardEmi; Insert: Partial<CreditCardEmi>; Update: Partial<CreditCardEmi> };
      budgets: { Row: Budget; Insert: Partial<Budget>; Update: Partial<Budget> };
      budget_categories: { Row: BudgetCategory; Insert: Partial<BudgetCategory>; Update: Partial<BudgetCategory> };
      bills: { Row: Bill; Insert: Partial<Bill>; Update: Partial<Bill> };
      bill_payments: { Row: BillPayment; Insert: Partial<BillPayment>; Update: Partial<BillPayment> };
      loans: { Row: Loan; Insert: Partial<Loan>; Update: Partial<Loan> };
      loan_payments: { Row: LoanPayment; Insert: Partial<LoanPayment>; Update: Partial<LoanPayment> };
      notifications: { Row: AppNotification; Insert: Partial<AppNotification>; Update: Partial<AppNotification> };
      savings_goals: { Row: SavingsGoal; Insert: Partial<SavingsGoal>; Update: Partial<SavingsGoal> };
      savings_contributions: { Row: SavingsContribution; Insert: Partial<SavingsContribution>; Update: Partial<SavingsContribution> };
      investments: { Row: Investment; Insert: Partial<Investment>; Update: Partial<Investment> };
      assets: { Row: Asset; Insert: Partial<Asset>; Update: Partial<Asset> };
      net_worth_snapshots: { Row: NetWorthSnapshot; Insert: Partial<NetWorthSnapshot>; Update: Partial<NetWorthSnapshot> };
      remittances: { Row: Remittance; Insert: Partial<Remittance>; Update: Partial<Remittance> };
      expense_splits: { Row: ExpenseSplit; Insert: Partial<ExpenseSplit>; Update: Partial<ExpenseSplit> };
      family_events: { Row: FamilyEvent; Insert: Partial<FamilyEvent>; Update: Partial<FamilyEvent> };
      receipts: { Row: Receipt; Insert: Partial<Receipt>; Update: Partial<Receipt> };
    };
  };
}
