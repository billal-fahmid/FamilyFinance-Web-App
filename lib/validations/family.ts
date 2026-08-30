import { z } from 'zod';

export const createFamilySchema = z.object({
  name: z.string().min(2, 'Family name must be at least 2 characters').max(100),
  currency: z.string().default('BDT'),
});

export const inviteMemberSchema = z.object({
  displayName: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  relationship: z.string().optional(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member'),
});

export const updateMemberSchema = z.object({
  displayName: z.string().min(1, 'Name is required'),
  relationship: z.string().optional(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

export type CreateFamilyInput = z.infer<typeof createFamilySchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
