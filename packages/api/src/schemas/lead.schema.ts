import { z } from 'zod';

const nullableText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);

export const createLeadSchema = z.object({
  name: z.string().trim().min(2).max(160),
  company: nullableText(160),
  email: z.string().trim().email().max(254).optional().transform((value) => value?.toLowerCase() || null),
  phone: nullableText(40),
  source: nullableText(80),
  notes: nullableText(5000),
}).refine((lead) => lead.email || lead.phone, {
  message: 'Lead cần có ít nhất email hoặc số điện thoại.',
  path: ['email'],
});

export const listLeadsQuerySchema = z.object({
  q: z.string().trim().min(1).max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED']).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  assigned_to: z.coerce.number().int().positive().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
