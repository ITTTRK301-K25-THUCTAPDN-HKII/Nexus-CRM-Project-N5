import type { Request } from 'express';

export type UserRole = 'Admin' | 'Manager' | 'Sale';
export type UserStatus = 'ACTIVE' | 'LOCKED' | 'INACTIVE';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED';

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

export interface Lead {
  id: number;
  ownerUserId: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
