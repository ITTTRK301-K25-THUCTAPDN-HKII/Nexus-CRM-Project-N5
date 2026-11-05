import { verifyPassword } from '../auth.js';
import { findCredentialsByEmail, findUserById } from '../repositories/user.repository.js';
import type { AuthUser } from '../types.js';

export type LoginResult =
  | { ok: true; user: AuthUser }
  | { ok: false };

/** Business rules: normalize email, verify password, and enforce account status. */
export async function loginWithEmailAndPassword(email: string, password: string): Promise<LoginResult> {
  const credentials = await findCredentialsByEmail(email.trim().toLowerCase());
  if (!credentials || credentials.user.status !== 'ACTIVE' ||
      !verifyPassword(password, credentials.passwordHash)) {
    return { ok: false };
  }
  const user = await findUserById(credentials.user.id);
  return user?.status === 'ACTIVE' ? { ok: true, user } : { ok: false };
}
