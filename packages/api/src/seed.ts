import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { execute } from './db.js';

const seedUsers = [
  { name: 'Nexus Admin', email: 'admin@nexus.local', password: 'Admin123!', role: 'Admin' },
  { name: 'Nexus Manager', email: 'manager@nexus.local', password: 'Manager123!', role: 'Manager' },
  { name: 'Nexus Sale', email: 'sale@nexus.local', password: 'Sale123!', role: 'Sale' },
] as const;

export async function seedDevelopmentUsers() {
  if (config.NODE_ENV !== 'development') return;
  for (const user of seedUsers) {
    await execute(`INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`,
    [user.name, user.email, bcrypt.hashSync(user.password, 12), user.role]);
  }
}
