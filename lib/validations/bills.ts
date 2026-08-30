import { z } from 'zod';

const frequency = z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']);

export const BILL_CATEGORIES = [
  { key: 'rent', label: 'Rent' },
  { key: 'electricity', label: 'Electricity' },
  { key: 'gas', label: 'Gas' },
  { key: 'water', label: 'Water' },
  { key: 'internet', label: 'Internet' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'school_fees', label: 'School Fees' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'loan_emi', label: 'Loan EMI' },
  { key: 'credit_card_bill', label: 'Credit Card Bill' },
  { key: 'dps', label: 'DPS / Savings Scheme' },
  { key: 'other', label: 'Other' },
] as const;

export const billSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  amount: z.coerce.number().min(0, 'Must be 0 or more'),
  categoryKey: z.string().min(1, 'Category is required').default('other'),
  frequency: frequency.default('monthly'),
  nextDueDate: z.string().min(1, 'Due date is required'),
  paymentAccountId: z.string().uuid().optional().nullable(),
  reminderDaysBefore: z.coerce.number().int().min(0).max(60).default(3),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

export const billPaymentSchema = z.object({
  billId: z.string().uuid(),
  accountId: z.string().uuid('Paying account is required').optional().nullable(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  paidOn: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
});

export type BillInput = z.infer<typeof billSchema>;
export type BillPaymentInput = z.infer<typeof billPaymentSchema>;
