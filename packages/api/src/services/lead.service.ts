import type { CreateLeadInput, UpdateLeadInput } from '../schemas/lead.schema.js';
import { createLead, findActiveLead, findDuplicateLead, updateLead } from '../repositories/lead.repository.js';
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

export type UpdateLeadResult =
  | { ok: true; lead: Lead }
  | { ok: false; reason: 'not_found' | 'contact_required' }
  | { ok: false; reason: 'duplicate'; duplicate: Lead };

export async function updateLeadForUser(id: number, input: UpdateLeadInput): Promise<UpdateLeadResult> {
  const existing = await findActiveLead(id);
  if (!existing) return { ok: false, reason: 'not_found' };

  const email = input.email === undefined ? existing.email : input.email;
  const phone = input.phone === undefined ? existing.phone : input.phone;
  if (!email && !phone) return { ok: false, reason: 'contact_required' };

  const duplicate = await findDuplicateLead(email, phone, id);
  if (duplicate) return { ok: false, reason: 'duplicate', duplicate };

  try {
    const lead = await updateLead(id, input);
    return lead ? { ok: true, lead } : { ok: false, reason: 'not_found' };
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      const concurrentDuplicate = await findDuplicateLead(email, phone, id);
      if (concurrentDuplicate) return { ok: false, reason: 'duplicate', duplicate: concurrentDuplicate };
    }
    throw error;
  }
}
