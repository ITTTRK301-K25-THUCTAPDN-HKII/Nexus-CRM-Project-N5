import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import {
  authenticate,
  clearAuthCookies,
  consumeRefreshCookie,
  getUserById,
  hashPassword,
  requireRoles,
  revokeRefreshToken,
  revokeUserRefreshTokens,
  setAuthCookies,
  verifyPassword,
} from './auth.js';
import { config } from './config.js';
import type { AuthRequest, UserRole, UserStatus } from './types.js';

const roles = ['Admin', 'Manager', 'Sale'] as const;
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});
const forgotSchema = z.object({ email: z.string().email().max(254) });
const resetSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(8).max(128),
});
const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  role: z.enum(roles),
});
const updateUserSchema = z.object({
  role: z.enum(roles).optional(),
  status: z.enum(['ACTIVE', 'LOCKED', 'INACTIVE']).optional(),
}).refine((value) => Object.keys(value).length > 0);

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function validationError(error: z.ZodError) {
  return {
    message: 'Dữ liệu không hợp lệ.',
    errors: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
  };
}

function makeLoginKey(request: AuthRequest): string {
  const email = loginSchema.shape.email.safeParse(request.body?.email);
  const normalizedEmail = email.success ? email.data.trim().toLowerCase() : 'invalid';
  return createHash('sha256')
    .update(`${ipKeyGenerator(request.ip ?? '127.0.0.1')}:${normalizedEmail}`)
    .digest('hex');
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: makeLoginKey,
  skipSuccessfulRequests: true,
  handler: (_request, response) => {
    response.status(429).json({ message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.' });
  },
});

export const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({ message: 'Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau.' });
  },
});

const router = Router();

router.post('/auth/login', loginLimiter, (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(validationError(parsed.error));
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const row = db.prepare(`
    SELECT id, password_hash, status FROM users WHERE email = ? COLLATE NOCASE
  `).get(email) as { id: number; password_hash: string; status: UserStatus } | undefined;

  if (!row || row.status !== 'ACTIVE' || !verifyPassword(parsed.data.password, row.password_hash)) {
    response.status(401).json({ message: 'Email hoặc mật khẩu không chính xác, hoặc tài khoản chưa hoạt động.' });
    return;
  }

  const user = getUserById(row.id);
  if (!user) {
    response.status(401).json({ message: 'Tài khoản không tồn tại.' });
    return;
  }
  setAuthCookies(response, user);
  response.json({ user });
});

router.post('/auth/refresh', (request, response) => {
  const user = consumeRefreshCookie(request as AuthRequest, response);
  if (!user) {
    response.status(401).json({ message: 'Refresh token không hợp lệ hoặc đã hết hạn.' });
    return;
  }
  response.json({ user });
});

router.post('/auth/logout', (request, response) => {
  revokeRefreshToken(request.cookies?.nexus_refresh as string | undefined);
  clearAuthCookies(response);
  response.status(204).end();
});

router.get('/auth/me', authenticate, (request, response) => {
  response.json({ user: (request as AuthRequest).user });
});

router.post('/auth/forgot-password', forgotLimiter, (request, response) => {
  if (config.NODE_ENV === 'production') {
    response.status(503).json({ message: 'Dịch vụ email đặt lại mật khẩu chưa được cấu hình.' });
    return;
  }
  const parsed = forgotSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(validationError(parsed.error));
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = db.prepare('SELECT id, email FROM users WHERE email = ? COLLATE NOCASE')
    .get(email) as { id: number; email: string } | undefined;
  if (user) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const resetUrl = `${config.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
    const createReset = db.transaction(() => {
      db.prepare('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL')
        .run(user.id);
      db.prepare(`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)
      `).run(user.id, tokenHash(token), expiresAt);
      db.prepare(`
        INSERT INTO dev_mailbox (recipient, subject, reset_url) VALUES (?, ?, ?)
      `).run(user.email, 'Đặt lại mật khẩu Nexus CRM', resetUrl);
    });
    createReset();
  }
  response.json({ message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.' });
});

router.post('/auth/reset-password', (request, response) => {
  const parsed = resetSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(validationError(parsed.error));
    return;
  }

  const reset = db.prepare(`
    SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?
  `).get(tokenHash(parsed.data.token)) as {
    id: number;
    user_id: number;
    expires_at: string;
    used_at: string | null;
  } | undefined;
  if (!reset || reset.used_at || new Date(reset.expires_at).getTime() <= Date.now()) {
    response.status(400).json({ message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' });
    return;
  }

  const applyReset = db.transaction(() => {
    const consumed = db.prepare(`
      UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
      WHERE id = ? AND used_at IS NULL AND expires_at > ?
    `).run(reset.id, new Date().toISOString());
    if (consumed.changes !== 1) return false;
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(parsed.data.password), reset.user_id);
    db.prepare('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL')
      .run(reset.user_id);
    revokeUserRefreshTokens(reset.user_id);
    return true;
  });
  if (!applyReset()) {
    response.status(400).json({ message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' });
    return;
  }
  response.json({ message: 'Mật khẩu đã được cập nhật. Hãy đăng nhập lại.' });
});

router.get('/admin/users', authenticate, requireRoles('Admin'), (_request, response) => {
  const users = db.prepare(`
    SELECT id, name, email, role, status, created_at AS createdAt
    FROM users ORDER BY id
  `).all();
  response.json({ users });
});

router.post('/admin/users', authenticate, requireRoles('Admin'), (request, response, next) => {
  const parsed = createUserSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(validationError(parsed.error));
    return;
  }
  const values = parsed.data;
  try {
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)
    `).run(values.name, values.email.trim().toLowerCase(), hashPassword(values.password), values.role);
    const user = getUserById(Number(result.lastInsertRowid));
    response.status(201).json({ user });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      response.status(409).json({ message: 'Email này đã được sử dụng.' });
      return;
    }
    next(error);
  }
});

router.patch('/admin/users/:id', authenticate, requireRoles('Admin'), (request, response) => {
  const parsedId = z.coerce.number().int().positive().safeParse(request.params.id);
  const parsedBody = updateUserSchema.safeParse(request.body);
  if (!parsedId.success || !parsedBody.success) {
    response.status(400).json({
      message: 'Dữ liệu không hợp lệ.',
      errors: parsedBody.success ? [] : parsedBody.error.issues,
    });
    return;
  }

  const actor = (request as AuthRequest).user!;
  const { role, status } = parsedBody.data as { role?: UserRole; status?: UserStatus };
  if (actor.id === parsedId.data && (role && role !== 'Admin' || status && status !== 'ACTIVE')) {
    response.status(400).json({ message: 'Không thể tự hạ quyền hoặc khóa tài khoản Admin đang đăng nhập.' });
    return;
  }

  const existing = getUserById(parsedId.data);
  if (!existing) {
    response.status(404).json({ message: 'Không tìm thấy người dùng.' });
    return;
  }
  db.prepare(`
    UPDATE users SET role = COALESCE(?, role), status = COALESCE(?, status) WHERE id = ?
  `).run(role ?? null, status ?? null, parsedId.data);
  if (status && status !== 'ACTIVE') revokeUserRefreshTokens(parsedId.data);
  response.json({ user: getUserById(parsedId.data) });
});

router.delete('/admin/users/:id', authenticate, requireRoles('Admin'), (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ message: 'ID người dùng không hợp lệ.' });
    return;
  }
  if ((request as AuthRequest).user?.id === id) {
    response.status(400).json({ message: 'Không thể xóa tài khoản Admin đang đăng nhập.' });
    return;
  }
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) {
    response.status(404).json({ message: 'Không tìm thấy người dùng.' });
    return;
  }
  response.status(204).end();
});

router.get('/dev/mailbox', (_request, response) => {
  if (config.NODE_ENV !== 'development') {
    response.status(404).json({ message: 'Không tìm thấy.' });
    return;
  }
  const messages = db.prepare(`
    SELECT id, recipient, subject, reset_url AS resetUrl, created_at AS createdAt
    FROM dev_mailbox ORDER BY id DESC LIMIT 20
  `).all();
  response.json({ messages });
});

router.delete('/dev/mailbox', (_request, response) => {
  if (config.NODE_ENV !== 'development') {
    response.status(404).json({ message: 'Không tìm thấy.' });
    return;
  }
  db.prepare('DELETE FROM dev_mailbox').run();
  response.status(204).end();
});

export const apiRouter = router;
2