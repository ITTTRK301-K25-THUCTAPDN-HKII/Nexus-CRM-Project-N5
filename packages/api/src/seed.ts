import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { db } from './db.js';

const seedUsers = [
  { name: 'Nexus Admin', email: 'admin@nexus.local', password: 'Admin123!', role: 'Admin' },
  { name: 'Nexus Manager', email: 'manager@nexus.local', password: 'Manager123!', role: 'Manager' },
  { name: 'Nexus Sale', email: 'sale@nexus.local', password: 'Sale123!', role: 'Sale' },
] as const;

const createUser = db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password_hash, role)
  VALUES (?, ?, ?, ?)
`);

if (config.NODE_ENV === 'development') {
  for (const user of seedUsers) {
    createUser.run(user.name, user.email, bcrypt.hashSync(user.password, 12), user.role);
  }
}
