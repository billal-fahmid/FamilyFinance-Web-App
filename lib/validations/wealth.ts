import { z } from 'zod';

const positive = z.coerce.number().positive('Must be greater than 0');
const nonneg = z.coerce.number().min(0, 'Must be 0 or more');

export const SAVINGS_GOAL_TYPES = [
  { key: 'emergency_fund', label: 'Emergency Fund' },
  { key: 'laptop', label: 'Laptop' },
  { key: 'car', label: 'Car' },
  { key: 'house', label: 'House' },
  { key: 'education', label: 'Education' },
  { key: 'vacation', label: 'Vacation' },
  { key: 'wedding', label: 'Wedding' },
  { key: 'eid', label: 'Eid' },
  { key: 'hajj_umrah', label: 'Hajj / Umrah' },
  { key: 'custom', label: 'Custom Goal' },
] as const;

export const savingsGoalSchema = z.object({
  name: z.string().min(1, 'Goal name is required'),
  goalType: z
    .enum([
      'emergency_fund', 'laptop', 'car', 'house', 'education', 'vacation',
      'wedding', 'eid', 'hajj_umrah', 'custom',
    ])
    .default('custom'),
  targetAmount: positive,
  currentAmount: nonneg.default(0),
  targetDate: z.string().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export const savingsContributionSchema = z.object({
  goalId: z.string().uuid(),
  accountId: z.string().uuid().optional().nullable(),
  amount: positive,
  contributedOn: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
});

export const INVESTMENT_TYPES = [
  { key: 'dps', label: 'DPS' },
  { key: 'fdr', label: 'FDR' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'mutual_funds', label: 'Mutual Funds' },
  { key: 'gold', label: 'Gold' },
  { key: 'other', label: 'Other' },
] as const;

export const investmentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['dps', 'fdr', 'stocks', 'mutual_funds', 'gold', 'other']).default('other'),
  initialAmount: nonneg,
  currentValue: nonneg,
  startedOn: z.string().min(1, 'Date is required'),
  ownerMemberId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export const ASSET_TYPES = [
  { key: 'house', label: 'House' },
  { key: 'land', label: 'Land' },
  { key: 'car', label: 'Car' },
  { key: 'motorcycle', label: 'Motorcycle' },
  { key: 'gold', label: 'Gold' },
  { key: 'electronics', label: 'Electronics' },
  { key: 'other', label: 'Other' },
] as const;

export const assetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  assetType: z.enum(['house', 'land', 'car', 'motorcycle', 'gold', 'electronics', 'other']).default('other'),
  purchaseValue: nonneg,
  currentValue: nonneg,
  purchaseDate: z.string().optional().nullable(),
  ownerMemberId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export const remittanceSchema = z.object({
  senderName: z.string().min(1, 'Sender is required'),
  country: z.string().min(1, 'Country is required'),
  foreignCurrency: z.string().min(1, 'Currency is required').max(6),
  foreignAmount: positive,
  exchangeRate: positive,
  receivedOn: z.string().min(1, 'Date is required'),
  accountId: z.string().uuid('Receiving account is required'),
  personId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export const FAMILY_EVENT_TYPES = [
  { key: 'eid', label: 'Eid' },
  { key: 'ramadan', label: 'Ramadan' },
  { key: 'wedding', label: 'Wedding' },
  { key: 'birthday', label: 'Birthday' },
  { key: 'vacation', label: 'Vacation' },
  { key: 'family_gathering', label: 'Family Gathering' },
  { key: 'other', label: 'Other' },
] as const;

export const familyEventSchema = z.object({
  name: z.string().min(1, 'Event name is required'),
  eventType: z
    .enum(['eid', 'ramadan', 'wedding', 'birthday', 'vacation', 'family_gathering', 'other'])
    .default('other'),
  budgetAmount: nonneg.default(0),
  eventDate: z.string().optional().nullable(),
  notes: z.string().optional(),
});

export type SavingsGoalInput = z.infer<typeof savingsGoalSchema>;
export type SavingsContributionInput = z.infer<typeof savingsContributionSchema>;
export type InvestmentInput = z.infer<typeof investmentSchema>;
export type AssetInput = z.infer<typeof assetSchema>;
export type RemittanceInput = z.infer<typeof remittanceSchema>;
export type FamilyEventInput = z.infer<typeof familyEventSchema>;
