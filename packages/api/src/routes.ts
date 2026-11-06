import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db, execute, query } from './db.js';
import type { RowDataPacket } from 'mysql2/promise';
import { authenticate, clearAuthCookies, consumeRefreshCookie, getUserById, hashPassword, requireRoles, revokeRefreshToken, revokeUserRefreshTokens } from './auth.js';
import { config } from './config.js';
import type { AuthRequest, UserRole, UserStatus } from './types.js';
import { loginController } from './controllers/auth.controller.js';
import { createLeadForUser, updateLeadForUser } from './services/lead.service.js';
import { createLeadSchema, listLeadsQuerySchema, updateLeadSchema } from './schemas/lead.schema.js';
import { listLeads, softDeleteLead } from './repositories/lead.repository.js';

const roles = ['Admin', 'Manager', 'Sale'] as const;
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128) });
const forgotSchema = z.object({ email: z.string().email().max(254) });
const resetSchema = z.object({ token: z.string().min(32).max(256), password: z.string().min(8).max(128) });
const createUserSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(254), password: z.string().min(8).max(128), role: z.enum(roles) });
const updateUserSchema = z.object({ role: z.enum(roles).optional(), status: z.enum(['ACTIVE', 'LOCKED', 'INACTIVE']).optional() }).refine((value) => Object.keys(value).length > 0);
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const validationError = (error: z.ZodError) => ({ message: 'Dữ liệu không hợp lệ.', errors: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })) });

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
router.put('/leads/:id', authenticate, async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = updateLeadSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json(parsed.success ? { message: 'ID Lead không hợp lệ.' } : validationError(parsed.error));
    return;
  }

  const result = await updateLeadForUser(id.data, parsed.data);
  if (!result.ok) {
    if (result.reason === 'duplicate') {
      res.status(409).json({ message: 'Lead với email hoặc số điện thoại này đã tồn tại.', duplicate: result.duplicate });
      return;
    }
    if (result.reason === 'not_found') { res.status(404).json({ message: 'Không tìm thấy Lead.' }); return; }
    res.status(400).json({ message: 'Lead cần có ít nhất email hoặc số điện thoại.' });
    return;
  }
  res.json({ lead: result.lead });
});
router.delete('/leads/:id', authenticate, async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ message: 'ID Lead không hợp lệ.' }); return; }
  if (!(await softDeleteLead(id.data))) { res.status(404).json({ message: 'Không tìm thấy Lead.' }); return; }
  res.status(204).end();
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
export const apiRouter = router;
