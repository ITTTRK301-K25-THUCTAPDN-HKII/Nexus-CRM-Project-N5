import type { Request } from 'express';

export type UserRole = 'Admin' | 'Manager' | 'Sale';
export type UserStatus = 'ACTIVE' | 'LOCKED' | 'INACTIVE';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
