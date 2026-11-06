import type { CreateLeadInput } from '../schemas/lead.schema.js';
import { createLead, findDuplicateLead } from '../repositories/lead.repository.js';
import type { Lead } from '../types.js';

export type CreateLeadResult =
  | { ok: true; lead: Lead }
  | { ok: false; duplicate: Lead };

export async function createLeadForUser(ownerUserId: number, input: CreateLeadInput): Promise<CreateLeadResult> {
  const duplicate = await findDuplicateLead(input.email, input.phone);
  if (duplicate) return { ok: false, duplicate };

  try {
    return { ok: true, lead: await createLead(ownerUserId, input) };
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      const concurrentDuplicate = await findDuplicateLead(input.email, input.phone);
      if (concurrentDuplicate) return { ok: false, duplicate: concurrentDuplicate };
    }
    throw error;
  }
}
