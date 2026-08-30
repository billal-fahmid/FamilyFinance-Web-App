import { z } from 'zod';

const money = z.coerce.number().min(0, 'Must be 0 or more');
const positiveMoney = z.coerce.number().positive('Amount must be greater than 0');

export const creditCardSchema = z.object({
  provider: z.string().min(1, 'Bank / provider is required'),
  cardName: z.string().min(1, 'Card name is required'),
  ownerMemberId: z.string().uuid().optional().nullable(),
  cardholderName: z.string().optional(),
  last4: z
    .string()
    .regex(/^\d{4}$/, 'Enter exactly the last 4 digits')
    .optional()
    .or(z.literal('')),
  creditLimit: money,
  currentOutstanding: money.default(0),
  statementDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  dueDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  annualFee: money.default(0),
  interestRate: z.coerce.number().min(0).max(200).default(0),
  notes: z.string().optional(),
});

export const CREDIT_CARD_TXN_TYPES = [
  'purchase',
  'online_purchase',
  'pos_purchase',
  'cash_advance',
  'fee',
  'interest',
  'refund',
  'emi_purchase',
  'adjustment',
] as const;

export const creditCardTxnSchema = z.object({
  cardId: z.string().uuid('Card is required'),
  type: z.enum(CREDIT_CARD_TXN_TYPES).default('purchase'),
  amount: positiveMoney,
  occurredOn: z.string().min(1, 'Date is required'),
  merchant: z.string().optional(),
  categoryKey: z.string().optional(),
  personId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
  receiptUrl: z.string().url('Enter a valid URL').optional().or(z.literal('')),
});

export const creditCardStatementSchema = z.object({
  cardId: z.string().uuid('Card is required'),
  periodStart: z.string().min(1, 'Period start is required'),
  periodEnd: z.string().min(1, 'Period end is required'),
  statementDate: z.string().min(1, 'Statement date is required'),
  statementBalance: money,
  minimumPayment: money.default(0),
  dueDate: z.string().min(1, 'Due date is required'),
  notes: z.string().optional(),
});

export const creditCardPaymentSchema = z.object({
  cardId: z.string().uuid('Card is required'),
  statementId: z.string().uuid().optional().nullable(),
  fromAccountId: z.string().uuid('Paying account is required'),
  amount: positiveMoney,
  occurredOn: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
});

export const creditCardEmiSchema = z.object({
  cardId: z.string().uuid('Card is required'),
  product: z.string().min(1, 'Product is required'),
  originalAmount: positiveMoney,
  downPayment: money.default(0),
  tenureMonths: z.coerce.number().int().positive('Tenure must be at least 1 month'),
  monthlyInstallment: money,
  interestRate: z.coerce.number().min(0).max(200).default(0),
  startDate: z.string().min(1, 'Start date is required'),
  notes: z.string().optional(),
});

export type CreditCardInput = z.infer<typeof creditCardSchema>;
export type CreditCardTxnInput = z.infer<typeof creditCardTxnSchema>;
export type CreditCardStatementInput = z.infer<typeof creditCardStatementSchema>;
export type CreditCardPaymentInput = z.infer<typeof creditCardPaymentSchema>;
export type CreditCardEmiInput = z.infer<typeof creditCardEmiSchema>;
