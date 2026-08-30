import { z } from 'zod';

export const LOAN_TYPES = [
  { key: 'personal', label: 'Personal Loan' },
  { key: 'home', label: 'Home Loan' },
  { key: 'car', label: 'Car Loan' },
  { key: 'family', label: 'Family Loan' },
  { key: 'other', label: 'Other Debt' },
] as const;

export const loanSchema = z.object({
  type: z.enum(['personal', 'home', 'car', 'family', 'other']).default('personal'),
  lender: z.string().min(1, 'Lender is required'),
  principal: z.coerce.number().min(0, 'Must be 0 or more'),
  interestRate: z.coerce.number().min(0).max(200).default(0),
  emiAmount: z.coerce.number().min(0).default(0),
  tenureMonths: z.coerce.number().int().positive().optional().nullable(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional().nullable(),
  outstandingBalance: z.coerce.number().min(0, 'Must be 0 or more'),
  notes: z.string().optional(),
});

export const loanPaymentSchema = z.object({
  loanId: z.string().uuid(),
  accountId: z.string().uuid('Paying account is required').optional().nullable(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  principalComponent: z.coerce.number().min(0).optional().nullable(),
  interestComponent: z.coerce.number().min(0).optional().nullable(),
  paidOn: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
});

export type LoanInput = z.infer<typeof loanSchema>;
export type LoanPaymentInput = z.infer<typeof loanPaymentSchema>;
