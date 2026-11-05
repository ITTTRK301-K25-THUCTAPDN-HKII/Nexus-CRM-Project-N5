import { query } from '../db.js';
import type { RowDataPacket } from 'mysql2/promise';
import type { AuthUser } from '../types.js';

interface CredentialRow extends RowDataPacket, AuthUser { passwordHash: string; }
export interface UserCredentials { user: AuthUser; passwordHash: string; }

export async function findCredentialsByEmail(email: string): Promise<UserCredentials | undefined> {
  const rows = await query<CredentialRow[]>('SELECT id, name, email, role, status, password_hash AS passwordHash FROM users WHERE email = ?', [email]);
  const row = rows[0];
  if (!row) return undefined;
  const { passwordHash, ...user } = row;
  return { user, passwordHash };
}

export async function findUserById(id: number): Promise<AuthUser | undefined> {
  const rows = await query<(RowDataPacket & AuthUser)[]>('SELECT id, name, email, role, status FROM users WHERE id = ?', [id]);
  return rows[0];
}
