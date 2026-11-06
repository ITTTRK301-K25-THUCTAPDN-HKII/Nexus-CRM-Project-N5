import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { execute, query } from '../db.js';
import type { Lead, LeadStatus } from '../types.js';
import type { CreateLeadInput, UpdateLeadInput } from '../schemas/lead.schema.js';

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

export interface LeadListFilters {
  q?: string;
  status?: Exclude<LeadStatus, 'CONVERTED'>;
  source?: string;
  assignedTo?: number;
  limit: number;
  offset: number;
}

function leadSelect(where = ''): string {
  return `SELECT id, owner_user_id AS ownerUserId, name, company, email, phone, source, status, notes,
    created_at AS createdAt, updated_at AS updatedAt FROM leads ${where}`;
}

export async function findDuplicateLead(email: string | null, phone: string | null, excludeId?: number): Promise<Lead | undefined> {
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  if (email) { conditions.push('email = ?'); values.push(email); }
  if (phone) { conditions.push('phone = ?'); values.push(phone); }
  if (conditions.length === 0) return undefined;
  const duplicateWhere = `WHERE (${conditions.join(' OR ')})${excludeId === undefined ? '' : ' AND id <> ?'}`;
  if (excludeId !== undefined) values.push(excludeId);
  const rows = await query<LeadRow[]>(`${leadSelect(duplicateWhere)} LIMIT 1`, values);
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

export async function listLeads(filters: LeadListFilters): Promise<{ leads: Lead[]; total: number }> {
  const conditions: string[] = ['deleted_at IS NULL'];
  const values: (string | number)[] = [];
  if (filters.q) {
    conditions.push('(name LIKE ? OR phone LIKE ?)');
    const keyword = `%${filters.q}%`;
    values.push(keyword, keyword);
  }
  if (filters.status) { conditions.push('status = ?'); values.push(filters.status); }
  if (filters.source) { conditions.push('source = ?'); values.push(filters.source); }
  if (filters.assignedTo !== undefined) { conditions.push('owner_user_id = ?'); values.push(filters.assignedTo); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [leads, countRows] = await Promise.all([
    query<LeadRow[]>(`${leadSelect(where)} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...values, filters.limit, filters.offset]),
    query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM leads ${where}`, values),
  ]);
  return { leads, total: Number(countRows[0]?.total ?? 0) };
}

export async function findActiveLead(id: number): Promise<Lead | undefined> {
  const rows = await query<LeadRow[]>(`${leadSelect('WHERE id = ? AND deleted_at IS NULL')}`, [id]);
  return rows[0];
}

export async function updateLead(id: number, input: UpdateLeadInput): Promise<Lead | undefined> {
  const columns: Partial<Record<keyof UpdateLeadInput, string>> = {
    name: 'name', company: 'company', email: 'email', phone: 'phone',
    source: 'source', notes: 'notes', status: 'status',
  };
  const updates = Object.entries(input).filter(([key, value]) => value !== undefined && columns[key as keyof UpdateLeadInput]);
  if (!updates.length) return findActiveLead(id);
  const setClause = updates.map(([key]) => `${columns[key as keyof UpdateLeadInput]} = ?`).join(', ');
  await execute(`UPDATE leads SET ${setClause} WHERE id = ? AND deleted_at IS NULL`, [...updates.map(([, value]) => value), id]);
  return findActiveLead(id);
}

export async function softDeleteLead(id: number): Promise<boolean> {
  const result = await execute('UPDATE leads SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL', [id]);
  return result.affectedRows === 1;
}
