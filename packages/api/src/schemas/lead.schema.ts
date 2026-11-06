import { z } from 'zod';

const nullableText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);

export const createLeadSchema = z.object({
  name: z.string().trim().min(2).max(160),
  company: nullableText(160),
  email: z.string().trim().email().max(254).optional().transform((value) => value?.toLowerCase() || null),
  phone: nullableText(40).transform((value) => value?.replace(/[\s().-]/g, '') || null),
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

const optionalNullableText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional()
  .transform((value) => value === undefined || value === null ? value : value || null);

export const updateLeadSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  company: optionalNullableText(160),
  email: z.union([z.string().trim().email().max(254), z.literal(''), z.null()]).optional()
    .transform((value) => value === undefined || value === null ? value : value.toLowerCase() || null),
  phone: optionalNullableText(40).transform((value) => value == null ? value : value.replace(/[\s().-]/g, '') || null),
  source: optionalNullableText(80),
  notes: optionalNullableText(5000),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED']).optional(),
}).refine((lead) => Object.values(lead).some((value) => value !== undefined), {
  message: 'Cần cung cấp ít nhất một trường để cập nhật.',
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
