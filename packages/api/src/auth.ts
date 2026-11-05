import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthRequest, AuthUser, UserRole } from './types.js';
import { config } from './config.js';
import { db, execute, query } from './db.js';
import type { RowDataPacket } from 'mysql2/promise';

const accessCookie = 'nexus_access';
const refreshCookie = 'nexus_refresh';
const accessTtlSeconds = 15 * 60;
const refreshTtlMs = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = (path: string): CookieOptions => ({ httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', path });
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function issueAccessToken(user: AuthUser): string {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.JWT_SECRET, { expiresIn: accessTtlSeconds, issuer: 'nexus-crm', audience: 'nexus-web' });
}

async function createRefreshToken(userId: number): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  await execute('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [userId, hashToken(token), new Date(Date.now() + refreshTtlMs)]);
  return token;
}

export async function setAuthCookies(response: Response, user: AuthUser): Promise<void> {
  response.cookie(accessCookie, issueAccessToken(user), { ...cookieOptions('/api'), maxAge: accessTtlSeconds * 1000 });
  response.cookie(refreshCookie, await createRefreshToken(user.id), { ...cookieOptions('/api/auth'), maxAge: refreshTtlMs });
}
export function clearAuthCookies(response: Response): void {
  response.clearCookie(accessCookie, cookieOptions('/api'));
  response.clearCookie(refreshCookie, cookieOptions('/api/auth'));
}

interface UserRow extends RowDataPacket { id: number; name: string; email: string; role: UserRole; status: AuthUser['status']; }
export async function getUserById(id: number): Promise<AuthUser | undefined> {
  const rows = await query<UserRow[]>('SELECT id, name, email, role, status FROM users WHERE id = ?', [id]);
  return rows[0];
}

export async function authenticate(request: AuthRequest, response: Response, next: NextFunction): Promise<void> {
  const token = request.cookies?.[accessCookie] as string | undefined;
  if (!token) { response.status(401).json({ message: 'Vui lòng đăng nhập.' }); return; }
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { issuer: 'nexus-crm', audience: 'nexus-web' });
    if (typeof payload === 'string' || !payload.sub || !/^\d+$/.test(payload.sub)) { response.status(401).json({ message: 'Phiên đăng nhập không hợp lệ.' }); return; }
    const user = await getUserById(Number(payload.sub));
    if (!user || user.status !== 'ACTIVE') { response.status(401).json({ message: 'Tài khoản không hoạt động.' }); return; }
    request.user = user; next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) { response.status(401).json({ message: 'Phiên đăng nhập đã hết hạn.' }); return; }
    next(error);
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (request: AuthRequest, response: Response, next: NextFunction): void => {
    if (!request.user) { response.status(401).json({ message: 'Vui lòng đăng nhập.' }); return; }
    if (!roles.includes(request.user.role)) { response.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này.' }); return; }
    next();
  };
}

interface RefreshRow extends RowDataPacket { id: number; user_id: number; expires_at: Date; revoked_at: Date | null; }
export async function consumeRefreshCookie(request: AuthRequest, response: Response): Promise<AuthUser | undefined> {
  const raw = request.cookies?.[refreshCookie] as string | undefined;
  if (!raw) { clearAuthCookies(response); return undefined; }
  const rows = await query<RefreshRow[]>('SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?', [hashToken(raw)]);
  const existing = rows[0];
  if (!existing) { clearAuthCookies(response); return undefined; }
  if (existing.revoked_at) {
    await execute('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL', [existing.user_id]);
    clearAuthCookies(response); return undefined;
  }
  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    await execute('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?', [existing.id]); clearAuthCookies(response); return undefined;
  }
  const user = await getUserById(existing.user_id);
  if (!user || user.status !== 'ACTIVE') {
    await execute('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL', [existing.user_id]); clearAuthCookies(response); return undefined;
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL', [existing.id]);
    if ((result as { affectedRows: number }).affectedRows !== 1) { await connection.rollback(); clearAuthCookies(response); return undefined; }
    const token = randomBytes(48).toString('base64url');
    await connection.execute('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [user.id, hashToken(token), new Date(Date.now() + refreshTtlMs)]);
    await connection.commit();
    response.cookie(accessCookie, issueAccessToken(user), { ...cookieOptions('/api'), maxAge: accessTtlSeconds * 1000 });
    response.cookie(refreshCookie, token, { ...cookieOptions('/api/auth'), maxAge: refreshTtlMs });
    return user;
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

export function verifyPassword(password: string, passwordHash: string): boolean { return bcrypt.compareSync(password, passwordHash); }
export function hashPassword(password: string): string { return bcrypt.hashSync(password, 12); }
export async function revokeUserRefreshTokens(userId: number): Promise<void> { await execute('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL', [userId]); }
export async function revokeRefreshToken(rawToken: string | undefined): Promise<void> { if (rawToken) await execute('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL', [hashToken(rawToken)]); }
