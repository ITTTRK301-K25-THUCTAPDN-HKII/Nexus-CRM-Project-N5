import { Router } from 'express';
import { z } from 'zod';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { authenticate } from './auth.js';
import { db, execute, inTransaction, query } from './db.js';
import type { AuthRequest } from './types.js';

const stages = ['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
const createDealSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  contactId: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().trim().min(2).max(180),
  amount: z.coerce.number().finite().min(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('USD'),
  stage: z.enum(stages).default('PROSPECTING'),
  probability: z.coerce.number().int().min(0).max(100).default(0),
  expectedCloseDate: z.string().date().nullable().optional(),
  ownerUserId: z.coerce.number().int().positive().optional(),
});
const updateDealSchema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  amount: z.coerce.number().finite().min(0).optional(),
  stage: z.enum(stages).optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().date().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0);

interface DealRow extends RowDataPacket {
  id: number;
  accountId: number;
  accountName: string;
  contactId: number | null;
  ownerUserId: number;
  ownerName: string;
  ownerRole: 'Admin' | 'Manager' | 'Sale';
  name: string;
  amount: number;
  currency: string;
  stage: typeof stages[number];
  probability: number;
  expectedCloseDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DealHistoryRow extends RowDataPacket {
  id: number;
  previousStage: string | null;
  newStage: string | null;
  previousAmount: number | null;
  newAmount: number | null;
  note: string | null;
  changedAt: Date;
  changedByName: string | null;
}

function visibleDeals(user: NonNullable<AuthRequest['user']>): { where: string; values: Array<number | string> } {
  if (user.role === 'Admin') return { where: '', values: [] };
  if (user.role === 'Manager') {
    return {
      where: 'WHERE (d.owner_user_id = ? OR owner.role = ?)',
      values: [user.id, 'Sale'],
    };
  }
  return { where: 'WHERE d.owner_user_id = ?', values: [user.id] };
}

async function findVisibleDeal(user: NonNullable<AuthRequest['user']>, dealId: number): Promise<DealRow | undefined> {
  const scope = visibleDeals(user);
  const where = scope.where
    ? `${scope.where} AND d.id = ?`
    : 'WHERE d.id = ?';
  const values = [...scope.values, dealId];
  const rows = await query<DealRow[]>(`
    SELECT d.id, d.account_id AS accountId, a.name AS accountName,
      d.contact_id AS contactId, d.owner_user_id AS ownerUserId,
      owner.name AS ownerName, owner.role AS ownerRole, d.name, d.amount,
      d.currency, d.stage, d.probability,
      d.expected_close_date AS expectedCloseDate,
      d.created_at AS createdAt, d.updated_at AS updatedAt
    FROM deals d
    INNER JOIN users owner ON owner.id = d.owner_user_id
    INNER JOIN accounts a ON a.id = d.account_id
    ${where}
    LIMIT 1
  `, values);
  return rows[0];
}

function canManageDeal(user: NonNullable<AuthRequest['user']>, deal: DealRow): boolean {
  if (user.role === 'Admin') return true;
  if (user.role === 'Manager') return deal.ownerUserId === user.id || deal.ownerRole === 'Sale';
  return deal.ownerUserId === user.id;
}

async function canAccessAccount(
  user: NonNullable<AuthRequest['user']>,
  accountId: number,
): Promise<boolean> {
  const rows = await query<(RowDataPacket & { id: number; accountOwnerId: number; ownerRole: string })[]>(
    'SELECT a.id, a.owner_user_id AS accountOwnerId, owner.role AS ownerRole FROM accounts a INNER JOIN users owner ON owner.id = a.owner_user_id WHERE a.id = ?',
    [accountId],
  );
  const account = rows[0];
  if (!account) return false;
  if (user.role === 'Admin') return true;
  if (user.role === 'Manager') {
    return account.accountOwnerId === user.id || account.ownerRole === 'Sale';
  }
  return account.accountOwnerId === user.id;
}

export const dealRouter = Router();

dealRouter.get('/deals', authenticate, async (request, response) => {
  const user = (request as AuthRequest).user!;
  const page = Math.max(1, Math.min(100000, Number(request.query.page) || 1));
  const limit = Math.max(1, Math.min(50, Number(request.query.limit) || 10));
  const scope = visibleDeals(user);
  const filters = [scope.where.replace(/^WHERE\s+/i, '')].filter(Boolean);
  const values: Array<number | string> = [...scope.values];

  if (typeof request.query.q === 'string' && request.query.q.trim()) {
    filters.push('(d.name LIKE ? OR a.name LIKE ?)');
    const search = `%${request.query.q.trim().slice(0, 100)}%`;
    values.push(search, search);
  }
  if (typeof request.query.stage === 'string' && stages.includes(request.query.stage as typeof stages[number])) {
    filters.push('d.stage = ?');
    values.push(request.query.stage);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const select = `
    FROM deals d
    INNER JOIN users owner ON owner.id = d.owner_user_id
    INNER JOIN accounts a ON a.id = d.account_id
    ${where}
  `;
  const [deals, countRows] = await Promise.all([
    query<DealRow[]>(`
      SELECT d.id, d.account_id AS accountId, a.name AS accountName,
        d.contact_id AS contactId, d.owner_user_id AS ownerUserId,
        owner.name AS ownerName, owner.role AS ownerRole, d.name, d.amount,
        d.currency, d.stage, d.probability,
        d.expected_close_date AS expectedCloseDate,
        d.created_at AS createdAt, d.updated_at AS updatedAt
      ${select}
      ORDER BY d.updated_at DESC, d.id DESC
      LIMIT ? OFFSET ?
    `, [...values, limit, (page - 1) * limit]),
    query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total ${select}`, values),
  ]);
  const total = Number(countRows[0]?.total ?? 0);
  response.json({ deals, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

dealRouter.post('/deals', authenticate, async (request, response) => {
  const parsed = createDealSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: 'Dữ liệu Deal không hợp lệ.', errors: parsed.error.issues });
    return;
  }

  const user = (request as AuthRequest).user!;
  const input = parsed.data;
  const ownerUserId = input.ownerUserId ?? user.id;
  if (user.role === 'Sale' && ownerUserId !== user.id) {
    response.status(403).json({ message: 'Sale chỉ được tạo Deal cho chính mình.' });
    return;
  }
  const owners = await query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM users WHERE id = ? AND status = ?',
    [ownerUserId, 'ACTIVE'],
  );
  if (!owners[0]) {
    response.status(400).json({ message: 'Không tìm thấy người phụ trách đang hoạt động.' });
    return;
  }
  if (user.role === 'Manager' && ownerUserId !== user.id) {
    const sales = await query<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM users WHERE id = ? AND role = 'Sale'",
      [ownerUserId],
    );
    if (!sales[0]) {
      response.status(403).json({ message: 'Manager chỉ được giao Deal cho thành viên Sale.' });
      return;
    }
  }

  const accountAllowed = await canAccessAccount(user, input.accountId);
  if (!accountAllowed) {
    response.status(404).json({ message: 'Không tìm thấy Account trong phạm vi được phép.' });
    return;
  }
  if (input.contactId) {
    const contacts = await query<(RowDataPacket & { id: number })[]>(
      'SELECT id FROM contacts WHERE id = ? AND account_id = ?',
      [input.contactId, input.accountId],
    );
    if (!contacts[0]) {
      response.status(400).json({ message: 'Contact không thuộc Account đã chọn.' });
      return;
    }
  }

  const dealId = await inTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(`
      INSERT INTO deals
        (account_id, contact_id, owner_user_id, name, amount, currency, stage, probability, expected_close_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      input.accountId, input.contactId ?? null, ownerUserId, input.name,
      input.amount, input.currency, input.stage, input.probability,
      input.expectedCloseDate ?? null,
    ]);
    await connection.execute(`
      INSERT INTO deal_history
        (deal_id, changed_by_user_id, previous_stage, new_stage, previous_amount, new_amount, note)
      VALUES (?, ?, NULL, ?, NULL, ?, ?)
    `, [result.insertId, user.id, input.stage, input.amount, 'Deal created']);
    return result.insertId;
  });
  const deal = await findVisibleDeal(user, Number(dealId));
  response.status(201).json({ deal });
});

dealRouter.get('/deals/:id', authenticate, async (request, response) => {
  const id = z.coerce.number().int().positive().safeParse(request.params.id);
  if (!id.success) {
    response.status(400).json({ message: 'ID Deal không hợp lệ.' });
    return;
  }
  const deal = await findVisibleDeal((request as AuthRequest).user!, id.data);
  if (!deal) {
    response.status(404).json({ message: 'Không tìm thấy Deal trong phạm vi được phép.' });
    return;
  }
  response.json({ deal });
});

dealRouter.get('/deals/:id/history', authenticate, async (request, response) => {
  const id = z.coerce.number().int().positive().safeParse(request.params.id);
  if (!id.success) {
    response.status(400).json({ message: 'ID Deal không hợp lệ.' });
    return;
  }
  const user = (request as AuthRequest).user!;
  const deal = await findVisibleDeal(user, id.data);
  if (!deal) {
    response.status(404).json({ message: 'Không tìm thấy Deal trong phạm vi được phép.' });
    return;
  }

  const history = await query<DealHistoryRow[]>(`
    SELECT h.id, h.previous_stage AS previousStage, h.new_stage AS newStage,
      h.previous_amount AS previousAmount, h.new_amount AS newAmount,
      h.note, h.changed_at AS changedAt, u.name AS changedByName
    FROM deal_history h
    LEFT JOIN users u ON u.id = h.changed_by_user_id
    WHERE h.deal_id = ?
    ORDER BY h.changed_at DESC, h.id DESC
  `, [id.data]);
  response.json({ deal: { id: deal.id, name: deal.name }, history });
});

dealRouter.patch('/deals/:id', authenticate, async (request, response) => {
  const id = z.coerce.number().int().positive().safeParse(request.params.id);
  const parsed = updateDealSchema.safeParse(request.body);
  if (!id.success || !parsed.success) {
    response.status(400).json({ message: 'Dữ liệu cập nhật Deal không hợp lệ.', errors: parsed.success ? [] : parsed.error.issues });
    return;
  }
  const user = (request as AuthRequest).user!;
  const changes = parsed.data;
  const updated = await inTransaction(async (connection) => {
    const [rows] = await connection.execute<(RowDataPacket & {
      id: number;
      ownerUserId: number;
      ownerRole: 'Admin' | 'Manager' | 'Sale';
      stage: typeof stages[number];
      amount: number;
    })[]>(`
      SELECT d.id, d.owner_user_id AS ownerUserId, owner.role AS ownerRole,
        d.stage, d.amount
      FROM deals d
      INNER JOIN users owner ON owner.id = d.owner_user_id
      WHERE d.id = ?
      FOR UPDATE
    `, [id.data]);
    const current = rows[0];
    if (!current) return { kind: 'not_found' as const };

    const allowed = user.role === 'Admin'
      || (user.role === 'Manager' && (current.ownerUserId === user.id || current.ownerRole === 'Sale'))
      || (user.role === 'Sale' && current.ownerUserId === user.id);
    if (!allowed) return { kind: 'forbidden' as const };

    const assignments: string[] = [];
    const values: Array<string | number | null> = [];
    if (changes.name !== undefined) { assignments.push('name = ?'); values.push(changes.name); }
    if (changes.amount !== undefined) { assignments.push('amount = ?'); values.push(changes.amount); }
    if (changes.stage !== undefined) { assignments.push('stage = ?'); values.push(changes.stage); }
    if (changes.probability !== undefined) { assignments.push('probability = ?'); values.push(changes.probability); }
    if (changes.expectedCloseDate !== undefined) {
      assignments.push('expected_close_date = ?');
      values.push(changes.expectedCloseDate);
    }

    if (assignments.length) {
      await connection.execute(`UPDATE deals SET ${assignments.join(', ')} WHERE id = ?`, [...values, id.data]);
    }

    const stageChanged = changes.stage !== undefined && changes.stage !== current.stage;
    const amountChanged = changes.amount !== undefined && Number(changes.amount) !== Number(current.amount);
    if (stageChanged || amountChanged) {
      const note = [
        stageChanged ? `Stage: ${current.stage} → ${changes.stage}` : '',
        amountChanged ? `Amount: ${current.amount} → ${changes.amount}` : '',
      ].filter(Boolean).join('; ');
      await connection.execute(`
        INSERT INTO deal_history
          (deal_id, changed_by_user_id, previous_stage, new_stage, previous_amount, new_amount, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        id.data,
        user.id,
        stageChanged ? current.stage : null,
        stageChanged ? changes.stage! : null,
        amountChanged ? current.amount : null,
        amountChanged ? changes.amount! : null,
        note,
      ]);
    }
    return { kind: 'updated' as const };
  });

  if (updated.kind === 'not_found' || updated.kind === 'forbidden') {
    response.status(404).json({ message: 'Không tìm thấy Deal trong phạm vi được phép.' });
    return;
  }
  const deal = await findVisibleDeal(user, id.data);
  response.json({ deal });
});
