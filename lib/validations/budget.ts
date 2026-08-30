import { z } from 'zod';

export const budgetCategoryRowSchema = z.object({
  categoryKey: z.string().min(1, 'Category is required'),
  limitAmount: z.coerce.number().min(0, 'Must be 0 or more'),
});

export const budgetSchema = z.object({
  month: z.string().min(1, 'Month is required'), // YYYY-MM-01
  totalLimit: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().optional(),
  categories: z.array(budgetCategoryRowSchema).default([]),
});

export type BudgetInput = z.infer<typeof budgetSchema>;
export type BudgetCategoryRowInput = z.infer<typeof budgetCategoryRowSchema>;
