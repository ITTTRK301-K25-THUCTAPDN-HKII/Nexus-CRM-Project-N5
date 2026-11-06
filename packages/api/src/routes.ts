import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db, execute, inTransaction, query } from './db.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { authenticate, clearAuthCookies, consumeRefreshCookie, getUserById, hashPassword, requireRoles, revokeRefreshToken, revokeUserRefreshTokens } from './auth.js';
import { config } from './config.js';
import type { AuthRequest, UserRole, UserStatus } from './types.js';
import { loginController } from './controllers/auth.controller.js';
import { createLeadForUser } from './services/lead.service.js';
import { createLeadSchema, listLeadsQuerySchema } from './schemas/lead.schema.js';
import { listLeads } from './repositories/lead.repository.js';

const roles = ['Admin', 'Manager', 'Sale'] as const;
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128) });
const forgotSchema = z.object({ email: z.string().email().max(254) });
const resetSchema = z.object({ token: z.string().min(32).max(256), password: z.string().min(8).max(128) });
const createUserSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(254), password: z.string().min(8).max(128), role: z.enum(roles) });
const updateUserSchema = z.object({ role: z.enum(roles).optional(), status: z.enum(['ACTIVE', 'LOCKED', 'INACTIVE']).optional() }).refine((value) => Object.keys(value).length > 0);
const leadSchema = z.object({
  name: z.string().trim().min(2).max(160),
  company: z.string().trim().max(160).optional().default(''),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional().default(''),
  phone: z.string().trim().max(40).optional().default('')
    .transform((value) => value.replace(/[\s().-]/g, ''))
    .refine((value) => !value || /^\+?\d{6,20}$/.test(value), 'Số điện thoại không hợp lệ.'),
  source: z.string().trim().max(80).optional().default(''),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED']).optional().default('NEW'),
  notes: z.string().trim().max(5000).optional().default(''),
}).refine((lead) => lead.email || lead.phone, {
  message: 'Lead cần có ít nhất email hoặc số điện thoại.',
  path: ['email'],
});
const convertLeadSchema = z.object({
  accountName: z.string().trim().min(2).max(160).optional(),
  createContact: z.boolean().default(true),
});
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const validationError = (error: z.ZodError) => ({ message: 'Dữ liệu không hợp lệ.', errors: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })) });

function customerOwnership(user: AuthRequest['user']): { clause: string; values: number[] } {
  if (!user || user.role === 'Admin' || user.role === 'Manager') return { clause: '', values: [] };
  return { clause: 'owner_user_id = ?', values: [user.id] };
}

function pageOptions(request: AuthRequest): { page: number; pageSize: number; offset: number; search: string } {
  const requestedPage = Number(request.query.page);
  const requestedPageSize = Number(request.query.pageSize);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(100000, requestedPage)
    : 1;
  const pageSize = Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(50, requestedPageSize)
    : 10;
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search: typeof request.query.search === 'string' ? request.query.search.trim().slice(0, 100) : '',
  };
}

async function findLeadDuplicate(email: string, phone: string, excludedId?: number): Promise<boolean> {
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  if (email) {
    conditions.push('LOWER(email) = LOWER(?)');
    values.push(email);
  }
  if (phone) {
    conditions.push('phone = ?');
    values.push(phone);
  }
  if (!conditions.length) return false;
  const excludedClause = excludedId ? ' AND id <> ?' : '';
  if (excludedId) values.push(excludedId);
  const rows = await query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM leads WHERE (${conditions.join(' OR ')})${excludedClause} LIMIT 1`,
    values,
  );
  return rows.length > 0;
}

async function canAccessCustomer(user: NonNullable<AuthRequest['user']>, entity: 'leads' | 'accounts' | 'contacts', id: number): Promise<boolean> {
  if (user.role === 'Admin' || user.role === 'Manager') return true;
  const rows = await query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM ${entity} WHERE id = ? AND owner_user_id = ? LIMIT 1`,
    [id, user.id],
  );
  return rows.length > 0;
}

function makeLoginKey(request: AuthRequest): string {
  const email = loginSchema.shape.email.safeParse(request.body?.email);
  return createHash('sha256').update(`${ipKeyGenerator(request.ip ?? '127.0.0.1')}:${email.success ? email.data.trim().toLowerCase() : 'invalid'}`).digest('hex');
}
export const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: makeLoginKey, skipSuccessfulRequests: true, handler: (_req, res) => res.status(429).json({ message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.' }) });
export const forgotLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => res.status(429).json({ message: 'Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau.' }) });
export const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => res.status(429).json({ message: 'Bạn đã thử đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau 15 phút.' }) });

interface UserRow extends RowDataPacket { id: number; name: string; email: string; role: UserRole; status: UserStatus; password_hash?: string; createdAt?: Date; }
const router = Router();
router.get('/leads', authenticate, async (req, res) => {
  const parsed = listLeadsQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json(validationError(parsed.error)); return; }

  const { q, page, limit, status, source, assigned_to: assignedTo } = parsed.data;
  const { leads, total } = await listLeads({
    q, status, source, assignedTo, limit, offset: (page - 1) * limit,
  });
  res.json({
    leads,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
router.post('/leads', authenticate, async (req, res) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json(validationError(parsed.error)); return; }

  const result = await createLeadForUser((req as AuthRequest).user!.id, parsed.data);
  if (!result.ok) {
    res.status(409).json({
      message: 'Lead với email hoặc số điện thoại này đã tồn tại.',
      duplicate: result.duplicate,
    });
    return;
  }
  res.status(201).json({ lead: result.lead });
});
router.post('/auth/login', loginLimiter, loginController);
router.post('/auth/refresh', async (req, res) => { const user = await consumeRefreshCookie(req as AuthRequest, res); if (!user) { res.status(401).json({ message: 'Refresh token không hợp lệ hoặc đã hết hạn.' }); return; } res.json({ user }); });
router.post('/auth/logout', async (req, res) => { await revokeRefreshToken(req.cookies?.nexus_refresh as string | undefined); clearAuthCookies(res); res.status(204).end(); });
router.get('/auth/me', authenticate, (req, res) => res.json({ user: (req as AuthRequest).user }));

router.post('/auth/forgot-password', forgotLimiter, async (req, res) => {
  if (config.NODE_ENV === 'production') { res.status(503).json({ message: 'Dịch vụ email đặt lại mật khẩu chưa được cấu hình.' }); return; }
  const parsed = forgotSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json(validationError(parsed.error)); return; }
  const rows = await query<UserRow[]>('SELECT id, email FROM users WHERE email = ?', [parsed.data.email.trim().toLowerCase()]);
  const user = rows[0];
  if (user) {
    const token = randomBytes(32).toString('hex'); const resetUrl = `${config.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
    const conn = await db.getConnection();
    try { await conn.beginTransaction(); await conn.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL', [user.id]); await conn.execute('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [user.id, tokenHash(token), new Date(Date.now() + 15 * 60 * 1000)]); await conn.execute('INSERT INTO dev_mailbox (recipient, subject, reset_url) VALUES (?, ?, ?)', [user.email, 'Đặt lại mật khẩu Nexus CRM', resetUrl]); await conn.commit(); } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  }
  res.json({ message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.' });
});
router.post('/auth/reset-password', resetLimiter, async (req, res) => {
  const parsed = resetSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json(validationError(parsed.error)); return; }
  const rows = await query<(RowDataPacket & { id: number; user_id: number; expires_at: Date; used_at: Date | null })[]>('SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?', [tokenHash(parsed.data.token)]);
  const reset = rows[0]; if (!reset || reset.used_at || new Date(reset.expires_at).getTime() <= Date.now()) { res.status(400).json({ message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' }); return; }
  const conn = await db.getConnection(); let applied = false;
  try { await conn.beginTransaction(); const [result] = await conn.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL AND expires_at > NOW()', [reset.id]); if ((result as { affectedRows: number }).affectedRows === 1) { await conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(parsed.data.password), reset.user_id]); await conn.execute('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL', [reset.user_id]); await conn.execute('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL', [reset.user_id]); applied = true; } await conn.commit(); } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  if (!applied) { res.status(400).json({ message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' }); return; }
  res.json({ message: 'Mật khẩu đã được cập nhật. Hãy đăng nhập lại.' });
});

router.get('/admin/users', authenticate, requireRoles('Admin'), async (_req, res) => { const users = await query<UserRow[]>('SELECT id, name, email, role, status, created_at AS createdAt FROM users ORDER BY id'); res.json({ users }); });
router.post('/admin/users', authenticate, requireRoles('Admin'), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json(validationError(parsed.error)); return; }
  try { const result = await execute('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [parsed.data.name, parsed.data.email.trim().toLowerCase(), hashPassword(parsed.data.password), parsed.data.role]); res.status(201).json({ user: await getUserById(Number(result.insertId)) }); }
  catch (error) { if ((error as { code?: string }).code === 'ER_DUP_ENTRY') { res.status(409).json({ message: 'Email này đã được sử dụng.' }); return; } throw error; }
});
router.patch('/admin/users/:id', authenticate, requireRoles('Admin'), async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id), body = updateUserSchema.safeParse(req.body); if (!id.success || !body.success) { res.status(400).json({ message: 'Dữ liệu không hợp lệ.', errors: body.success ? [] : body.error.issues }); return; }
  const actor = (req as AuthRequest).user!; const { role, status } = body.data as { role?: UserRole; status?: UserStatus };
  if (actor.id === id.data && ((role && role !== 'Admin') || (status && status !== 'ACTIVE'))) { res.status(400).json({ message: 'Không thể tự hạ quyền hoặc khóa tài khoản Admin đang đăng nhập.' }); return; }
  if (!(await getUserById(id.data))) { res.status(404).json({ message: 'Không tìm thấy người dùng.' }); return; }
  await execute('UPDATE users SET role = COALESCE(?, role), status = COALESCE(?, status) WHERE id = ?', [role ?? null, status ?? null, id.data]); if (status && status !== 'ACTIVE') await revokeUserRefreshTokens(id.data); res.json({ user: await getUserById(id.data) });
});
router.delete('/admin/users/:id', authenticate, requireRoles('Admin'), async (req, res) => { const id = Number(req.params.id); if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ message: 'ID người dùng không hợp lệ.' }); return; } if ((req as AuthRequest).user?.id === id) { res.status(400).json({ message: 'Không thể xóa tài khoản Admin đang đăng nhập.' }); return; } const result = await execute('DELETE FROM users WHERE id = ?', [id]); if (!result.affectedRows) { res.status(404).json({ message: 'Không tìm thấy người dùng.' }); return; } res.status(204).end(); });
router.get('/dev/mailbox', async (_req, res) => { if (config.NODE_ENV !== 'development') { res.status(404).json({ message: 'Không tìm thấy.' }); return; } const messages = await query<RowDataPacket[]>('SELECT id, recipient, subject, reset_url AS resetUrl, created_at AS createdAt FROM dev_mailbox ORDER BY id DESC LIMIT 20'); res.json({ messages }); });
router.delete('/dev/mailbox', async (_req, res) => { if (config.NODE_ENV !== 'development') { res.status(404).json({ message: 'Không tìm thấy.' }); return; } await execute('DELETE FROM dev_mailbox'); res.status(204).end(); });

router.get('/customers/leads', authenticate, async (req, res) => {
  const { page, pageSize, offset, search } = pageOptions(req as AuthRequest);
  const ownership = customerOwnership((req as AuthRequest).user);
  const filters = [ownership.clause].filter(Boolean);
  const values: Array<string | number> = [...ownership.values];
  if (search) {
    filters.push('(name LIKE ? OR company LIKE ? OR email LIKE ? OR phone LIKE ?)');
    const term = `%${search}%`;
    values.push(term, term, term, term);
  }
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  if (status && ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED'].includes(status)) {
    filters.push('status = ?');
    values.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [leads, countRows] = await Promise.all([
    query<UserRow[]>(`SELECT id, name, company, email, phone, source, status, notes, converted_account_id AS accountId, owner_user_id AS ownerUserId, created_at AS createdAt FROM leads ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`, [...values, pageSize, offset]),
    query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM leads ${where}`, values),
  ]);
  res.json({ items: leads, page, pageSize, total: countRows[0]?.total ?? 0 });
});

router.get('/customers/accounts', authenticate, async (req, res) => {
  const { page, pageSize, offset, search } = pageOptions(req as AuthRequest);
  const ownership = customerOwnership((req as AuthRequest).user);
  const where = [
    ownership.clause,
    search ? '(name LIKE ? OR industry LIKE ? OR email LIKE ? OR phone LIKE ?)' : '',
  ].filter(Boolean);
  const values: Array<string | number> = [...ownership.values];
  if (search) {
    const term = `%${search}%`;
    values.push(term, term, term, term);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [accounts, countRows] = await Promise.all([
    query<UserRow[]>(`SELECT id, name, industry, website, phone, email, owner_user_id AS ownerUserId, created_at AS createdAt FROM accounts ${clause} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`, [...values, pageSize, offset]),
    query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM accounts ${clause}`, values),
  ]);
  res.json({ items: accounts, page, pageSize, total: countRows[0]?.total ?? 0 });
});

router.get('/customers/contacts', authenticate, async (req, res) => {
  const { page, pageSize, offset, search } = pageOptions(req as AuthRequest);
  const user = (req as AuthRequest).user!;
  const filters: string[] = [];
  const values: Array<string | number> = [];
  if (user.role === 'Sale') {
    filters.push('c.owner_user_id = ?', 'a.owner_user_id = ?');
    values.push(user.id, user.id);
  }
  if (search) {
    filters.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR a.name LIKE ?)');
    const term = `%${search}%`;
    values.push(term, term, term, term, term);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [contacts, countRows] = await Promise.all([
    query<RowDataPacket[]>(`SELECT c.id, c.account_id AS accountId, c.first_name AS firstName, c.last_name AS lastName, c.email, c.phone, c.job_title AS jobTitle, c.owner_user_id AS ownerUserId, a.name AS accountName FROM contacts c INNER JOIN accounts a ON a.id = c.account_id ${where} ORDER BY c.last_name, c.first_name, c.id LIMIT ? OFFSET ?`, [...values, pageSize, offset]),
    query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM contacts c INNER JOIN accounts a ON a.id = c.account_id ${where}`, values),
  ]);
  res.json({ items: contacts, page, pageSize, total: countRows[0]?.total ?? 0 });
});

router.post('/customers/leads', authenticate, async (req, res) => {
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json(validationError(parsed.error)); return; }
  const lead = parsed.data;
  const user = (req as AuthRequest).user!;
  const result = await createLeadForUser(user.id, {
    name: lead.name,
    company: lead.company || null,
    email: lead.email.toLowerCase() || null,
    phone: lead.phone || null,
    source: lead.source || null,
    notes: lead.notes || null,
  });
  if (!result.ok) {
    res.status(409).json({
      code: 'DUPLICATE_LEAD',
      message: 'Đã có khách hàng tiềm năng trùng email hoặc số điện thoại.',
      duplicate: result.duplicate,
    });
    return;
  }
  if (lead.status !== 'NEW') {
    await execute('UPDATE leads SET status = ? WHERE id = ?', [lead.status, result.lead.id]);
  }
  const rows = await query<UserRow[]>('SELECT id, name, company, email, phone, source, status, notes, converted_account_id AS accountId, owner_user_id AS ownerUserId, created_at AS createdAt FROM leads WHERE id = ?', [result.lead.id]);
  res.status(201).json({ item: rows[0] });
});

router.patch('/customers/leads/:id', authenticate, async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = leadSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ message: 'Dữ liệu không hợp lệ.', errors: parsed.success ? [] : parsed.error.issues });
    return;
  }
  const user = (req as AuthRequest).user!;
  if (!(await canAccessCustomer(user, 'leads', id.data))) {
    res.status(404).json({ message: 'Không tìm thấy khách hàng tiềm năng.' });
    return;
  }
  const lead = parsed.data;
  if (await findLeadDuplicate(lead.email, lead.phone, id.data)) {
    res.status(409).json({ code: 'DUPLICATE_LEAD', message: 'Đã có khách hàng tiềm năng trùng email hoặc số điện thoại.' });
    return;
  }
  try {
    await execute(
      'UPDATE leads SET name = ?, company = ?, email = ?, phone = ?, source = ?, status = ?, notes = ? WHERE id = ?',
      [lead.name, lead.company || null, lead.email.toLowerCase() || null, lead.phone || null, lead.source || null, lead.status, lead.notes || null, id.data],
    );
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      res.status(409).json({ code: 'DUPLICATE_LEAD', message: 'Đã có khách hàng tiềm năng trùng email hoặc số điện thoại.' });
      return;
    }
    throw error;
  }
  const rows = await query<UserRow[]>('SELECT id, name, company, email, phone, source, status, notes, converted_account_id AS accountId, owner_user_id AS ownerUserId, created_at AS createdAt FROM leads WHERE id = ?', [id.data]);
  res.json({ item: rows[0] });
});

router.post('/customers/leads/:id/convert', authenticate, async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = convertLeadSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ message: 'Dữ liệu chuyển đổi không hợp lệ.', errors: parsed.success ? [] : parsed.error.issues });
    return;
  }
  const user = (req as AuthRequest).user!;
  if (!(await canAccessCustomer(user, 'leads', id.data))) {
    res.status(404).json({ message: 'Không tìm thấy khách hàng tiềm năng.' });
    return;
  }
  const rows = await query<(RowDataPacket & { id: number; name: string; company: string | null; email: string | null; phone: string | null; status: string })[]>(
    'SELECT id, name, company, email, phone, status FROM leads WHERE id = ?',
    [id.data],
  );
  const lead = rows[0];
  if (!lead) {
    res.status(404).json({ message: 'Không tìm thấy khách hàng tiềm năng.' });
    return;
  }
  if (lead.status === 'CONVERTED') {
    res.status(409).json({ message: 'Khách hàng tiềm năng đã được chuyển đổi.' });
    return;
  }
  const accountName = parsed.data.accountName || lead.company || lead.name;
  let accountId: number;
  try {
    accountId = await inTransaction(async (connection) => {
    const [accountResult] = await connection.execute<ResultSetHeader>(
      'INSERT INTO accounts (owner_user_id, name, email, phone) VALUES (?, ?, ?, ?)',
      [user.id, accountName, lead.email, lead.phone],
    );
    if (parsed.data.createContact && (lead.email || lead.phone)) {
      const nameParts = lead.name.trim().split(/\s+/);
      const firstName = nameParts.length > 1 ? nameParts.shift()! : lead.name.trim();
      const lastName = nameParts.join(' ');
      await connection.execute(
        'INSERT INTO contacts (account_id, owner_user_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
        [accountResult.insertId, user.id, firstName.slice(0, 80), lastName.slice(0, 80), lead.email, lead.phone],
      );
    }
    const [updateResult] = await connection.execute<ResultSetHeader>(
      'UPDATE leads SET status = ?, converted_account_id = ? WHERE id = ? AND status <> ?',
      ['CONVERTED', accountResult.insertId, id.data, 'CONVERTED'],
    );
    if (updateResult.affectedRows !== 1) throw new Error('Lead was converted concurrently.');
    await connection.execute(
      'INSERT INTO activities (user_id, lead_id, account_id, activity_type, subject, details) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, id.data, accountResult.insertId, 'STATUS_CHANGE', 'Lead converted', `Lead converted to account ${accountName}`],
    );
      return accountResult.insertId;
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Lead was converted concurrently.') {
      res.status(409).json({ message: 'Lead vừa được chuyển đổi ở một phiên khác.' });
      return;
    }
    throw error;
  }
  res.status(201).json({ accountId, message: 'Đã chuyển đổi lead thành khách hàng.' });
});

router.get('/customers/accounts/:id', authenticate, async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ message: 'ID khách hàng không hợp lệ.' }); return; }
  const user = (req as AuthRequest).user!;
  if (!(await canAccessCustomer(user, 'accounts', id.data))) {
    res.status(404).json({ message: 'Không tìm thấy khách hàng.' });
    return;
  }
  const [accountRows, contacts, deals, activities] = await Promise.all([
    query<UserRow[]>('SELECT a.id, a.name, a.industry, a.website, a.phone, a.email, a.billing_address AS billingAddress, a.owner_user_id AS ownerUserId, u.name AS ownerName, a.created_at AS createdAt FROM accounts a INNER JOIN users u ON u.id = a.owner_user_id WHERE a.id = ?', [id.data]),
  query<RowDataPacket[]>(`SELECT id, first_name AS firstName, last_name AS lastName, email, phone, job_title AS jobTitle FROM contacts WHERE account_id = ?${user.role === 'Sale' ? ' AND owner_user_id = ?' : ''} ORDER BY last_name, first_name`, user.role === 'Sale' ? [id.data, user.id] : [id.data]),
  query<RowDataPacket[]>(`SELECT id, name, amount, currency, stage, probability, expected_close_date AS expectedCloseDate FROM deals WHERE account_id = ?${user.role === 'Sale' ? ' AND owner_user_id = ?' : ''} ORDER BY updated_at DESC LIMIT 20`, user.role === 'Sale' ? [id.data, user.id] : [id.data]),
  query<RowDataPacket[]>(`SELECT id, activity_type AS type, subject, details, occurred_at AS occurredAt FROM activities WHERE account_id = ?${user.role === 'Sale' ? ' AND user_id = ?' : ''} ORDER BY occurred_at DESC LIMIT 30`, user.role === 'Sale' ? [id.data, user.id] : [id.data]),
  ]);
  if (!accountRows[0]) { res.status(404).json({ message: 'Không tìm thấy khách hàng.' }); return; }
  res.json({ account: accountRows[0], contacts, deals, activities });
});

export const apiRouter = router;
