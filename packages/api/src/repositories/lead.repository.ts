import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { execute, query } from '../db.js';
import type { Lead, LeadStatus } from '../types.js';
import type { CreateLeadInput } from '../schemas/lead.schema.js';

interface LeadRow extends RowDataPacket {
  id: number;
  ownerUserId: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function leadSelect(where = ''): string {
  return `SELECT id, owner_user_id AS ownerUserId, name, company, email, phone, source, status, notes,
    created_at AS createdAt, updated_at AS updatedAt FROM leads ${where}`;
}

export async function findDuplicateLead(email: string | null, phone: string | null): Promise<Lead | undefined> {
  const conditions: string[] = [];
  const values: string[] = [];
  if (email) { conditions.push('email = ?'); values.push(email); }
  if (phone) { conditions.push('phone = ?'); values.push(phone); }
  if (conditions.length === 0) return undefined;
  const rows = await query<LeadRow[]>(`${leadSelect(`WHERE ${conditions.join(' OR ')}`)} LIMIT 1`, values);
  return rows[0];
}

export async function createLead(ownerUserId: number, input: CreateLeadInput): Promise<Lead> {
  const result: ResultSetHeader = await execute(
    `INSERT INTO leads (owner_user_id, name, company, email, phone, source, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ownerUserId, input.name, input.company, input.email, input.phone, input.source, input.notes],
  );
  const rows = await query<LeadRow[]>(`${leadSelect('WHERE id = ?')}`, [Number(result.insertId)]);
  return rows[0]!;
}
