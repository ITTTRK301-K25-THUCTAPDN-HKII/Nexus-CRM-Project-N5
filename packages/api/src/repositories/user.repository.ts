import { db } from '../db.js';
import type { AuthUser, UserStatus } from '../types.js';

export interface UserCredentials {
  user: AuthUser;
  passwordHash: string;
}

/** Data access layer: SQL stays inside repositories. */
export function findCredentialsByEmail(email: string): UserCredentials | undefined {
  const row = db.prepare(`
    SELECT id, name, email, role, status, password_hash AS passwordHash
    FROM users WHERE email = ? COLLATE NOCASE
  `).get(email) as (AuthUser & {
    status: UserStatus;
    passwordHash: string;
  }) | undefined;
  if (!row) return undefined;
  const { passwordHash, ...user } = row;
  return { user, passwordHash };
}

export function findUserById(id: number): AuthUser | undefined {
  return db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ?')
    .get(id) as AuthUser | undefined;
}
