import { z } from 'zod';
import { todayISO } from '@/lib/utils';

export const incomeSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  occurredOn: z.string().min(1, 'Date is required'),
  source: z.string().optional(),
  categoryKey: z.string().min(1, 'Category is required'),
  personId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid('Account is required'),
  isRecurring: z.boolean().default(false),
  frequency: z
    .enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'])
    .optional()
    .nullable(),
  notes: z.string().optional(),
});

export const expenseSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  occurredOn: z.string().min(1, 'Date is required'),
  categoryKey: z.string().min(1, 'Category is required'),
  subcategoryKey: z.string().optional(),
  personId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid('Account is required'),
  merchant: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  scope: z.enum(['personal', 'shared', 'family']).default('family'),
  eventId: z.string().uuid().optional().nullable(),
});

// Quick-add variant: only the essentials, for the sub-10-second flow
export const quickExpenseSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  categoryKey: z.string().min(1, 'Category is required'),
  accountId: z.string().uuid('Account is required'),
  occurredOn: z.string().min(1).default(() => todayISO()),
});

export const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  type: z.enum(['cash', 'bank', 'bkash', 'nagad', 'rocket', 'debit_card', 'savings', 'other']),
  openingBalance: z.coerce.number().min(0).default(0),
  ownerMemberId: z.string().uuid().optional().nullable(),
  maskedNumber: z.string().optional(),
  notes: z.string().optional(),
});

export const transferSchema = z
  .object({
    fromAccountId: z.string().uuid('Source account is required'),
    toAccountId: z.string().uuid('Destination account is required'),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    occurredOn: z.string().min(1, 'Date is required'),
    notes: z.string().optional(),
  })
  .refine((data) => data.fromAccountId !== data.toAccountId, {
    message: 'Source and destination accounts must be different',
    path: ['toAccountId'],
  });

export type IncomeInput = z.infer<typeof incomeSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type QuickExpenseInput = z.infer<typeof quickExpenseSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
