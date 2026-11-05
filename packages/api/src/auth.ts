import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthRequest, AuthUser, UserRole } from './types.js';
import { config } from './config.js';
import { db } from './db.js';

const accessCookie = 'nexus_access';
const refreshCookie = 'nexus_refresh';
const accessTtlSeconds = 15 * 60;
const refreshTtlMs = 7 * 24 * 60 * 60 * 1000;
const refreshTtlSeconds = refreshTtlMs / 1000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const cookieOptions = (path: string): CookieOptions => ({
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax',
  path,
});

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function issueAccessToken(user: AuthUser): string {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.JWT_SECRET, {
    expiresIn: accessTtlSeconds,
    issuer: 'nexus-crm',
    audience: 'nexus-web',
  });
}

function createRefreshToken(userId: number): string {
  const rawToken = jwt.sign({
    sub: String(userId),
    jti: randomBytes(32).toString('base64url'),
    token_use: 'refresh',
  }, config.JWT_SECRET, {
    expiresIn: refreshTtlSeconds,
    issuer: 'nexus-crm',
    audience: 'nexus-web',
  });
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, hashToken(rawToken), new Date(Date.now() + refreshTtlMs).toISOString());
  return rawToken;
}

export function setAuthCookies(response: Response, user: AuthUser): AuthTokens {
  const tokens = {
    accessToken: issueAccessToken(user),
    refreshToken: createRefreshToken(user.id),
  };
  response.cookie(accessCookie, tokens.accessToken, {
    ...cookieOptions('/api'),
    maxAge: accessTtlSeconds * 1000,
  });
  response.cookie(refreshCookie, tokens.refreshToken, {
    ...cookieOptions('/api/auth'),
    maxAge: refreshTtlMs,
  });
  return tokens;
}

export function clearAuthCookies(response: Response): void {
  response.clearCookie(accessCookie, cookieOptions('/api'));
  response.clearCookie(refreshCookie, cookieOptions('/api/auth'));
}

export function getUserById(id: number): AuthUser | undefined {
  return db.prepare(`
    SELECT id, name, email, role, status FROM users WHERE id = ?
  `).get(id) as AuthUser | undefined;
}

export function authenticate(request: AuthRequest, response: Response, next: NextFunction): void {
  const token = request.cookies?.[accessCookie] as string | undefined;
  if (!token) {
    response.status(401).json({ message: 'Vui lòng đăng nhập.' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      issuer: 'nexus-crm',
      audience: 'nexus-web',
    });
    if (typeof payload === 'string' || !payload.sub || !/^\d+$/.test(payload.sub)) {
      response.status(401).json({ message: 'Phiên đăng nhập không hợp lệ.' });
      return;
    }

    const user = getUserById(Number(payload.sub));
    if (!user || user.status !== 'ACTIVE') {
      response.status(401).json({ message: 'Tài khoản không hoạt động.' });
      return;
    }

    request.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      response.status(401).json({ message: 'Phiên đăng nhập đã hết hạn.' });
      return;
    }
    next(error);
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (request: AuthRequest, response: Response, next: NextFunction): void => {
    if (!request.user) {
      response.status(401).json({ message: 'Vui lòng đăng nhập.' });
      return;
    }
    if (!roles.includes(request.user.role)) {
      response.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này.' });
      return;
    }
    next();
  };
}

interface RotatedSession {
  user: AuthUser;
  tokens: AuthTokens;
}

export function rotateRefreshToken(rawToken: string | undefined): RotatedSession | undefined {
  if (!rawToken) return undefined;
  let payload: jwt.JwtPayload;
  try {
    const verified = jwt.verify(rawToken, config.JWT_SECRET, {
      issuer: 'nexus-crm',
      audience: 'nexus-web',
    });
    if (typeof verified === 'string' || verified.token_use !== 'refresh' || !verified.sub || !verified.jti) {
      return undefined;
    }
    payload = verified;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) return undefined;
    throw error;
  }
  const tokenHash = hashToken(rawToken);
  const existing = db.prepare(`
    SELECT id, user_id, expires_at, revoked_at
    FROM refresh_tokens WHERE token_hash = ?
  `).get(tokenHash) as {
    id: number;
    user_id: number;
    expires_at: string;
    revoked_at: string | null;
  } | undefined;

  if (!existing || String(existing.user_id) !== payload.sub) return undefined;
  if (existing.revoked_at) {
    db.prepare('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL')
      .run(existing.user_id);
    return undefined;
  }
  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    db.prepare('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
    return undefined;
  }

  const user = getUserById(existing.user_id);
  if (!user || user.status !== 'ACTIVE') {
    db.prepare('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL')
      .run(existing.user_id);
    return undefined;
  }

  const rotate = db.transaction(() => {
    const revoked = db.prepare(`
      UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL
    `).run(existing.id);
    if (revoked.changes !== 1) return undefined;
    return createRefreshToken(user.id);
  });
  const nextToken = rotate();
  if (!nextToken) return undefined;
  return { user, tokens: { accessToken: issueAccessToken(user), refreshToken: nextToken } };
}

export function consumeRefreshCookie(request: AuthRequest, response: Response): (AuthUser & AuthTokens) | undefined {
  const session = rotateRefreshToken(request.cookies?.[refreshCookie] as string | undefined);
  if (!session) {
    clearAuthCookies(response);
    return undefined;
  }
  response.cookie(accessCookie, session.tokens.accessToken, {
    ...cookieOptions('/api'),
    maxAge: accessTtlSeconds * 1000,
  });
  response.cookie(refreshCookie, session.tokens.refreshToken, {
    ...cookieOptions('/api/auth'),
    maxAge: refreshTtlMs,
  });
  return { ...session.user, ...session.tokens };
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  return bcrypt.compareSync(password, passwordHash);
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function revokeUserRefreshTokens(userId: number): void {
  db.prepare(`
    UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND revoked_at IS NULL
  `).run(userId);
}

export function revokeRefreshToken(rawToken: string | undefined): void {
  if (!rawToken) return;
  db.prepare(`
    UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
    WHERE token_hash = ? AND revoked_at IS NULL
  `).run(hashToken(rawToken));
}1
