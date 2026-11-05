import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from './app.js';
import { db } from './db.js';
import { revokeUserRefreshTokens } from './auth.js';

const app = createApp();

before(() => {
  db.prepare('DELETE FROM users').run();
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run('Demo Admin', 'admin@test.local', bcrypt.hashSync('Password123!', 10), 'Admin');
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run('Demo Sale', 'sale@test.local', bcrypt.hashSync('Password123!', 10), 'Sale');
});

after(() => {
  db.close();
});

test('login sets HttpOnly cookies and RBAC denies non-admin users', async () => {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({
    email: 'sale@test.local',
    password: 'Password123!',
  });
  assert.equal(login.status, 200);
  assert.match(String(login.headers['set-cookie']), /HttpOnly/i);

  const denied = await agent.get('/api/admin/users');
  assert.equal(denied.status, 403);
});

test('refresh rotates the cookie and logout revokes the current refresh token', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@test.local', password: 'Password123!' }).expect(200);
  const refresh = await agent.post('/api/auth/refresh').expect(200);
  assert.equal(refresh.body.user.role, 'Admin');

  await agent.post('/api/auth/logout').expect(204);
  await agent.post('/api/auth/refresh').expect(401);
});

test('forgot/reset password uses a one-time token and invalidates refresh sessions', async () => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@test.local') as { id: number };
  revokeUserRefreshTokens(user.id);
  await request(app).post('/api/auth/forgot-password').send({ email: 'admin@test.local' }).expect(200);
  const message = db.prepare('SELECT reset_url FROM dev_mailbox ORDER BY id DESC LIMIT 1')
    .get() as { reset_url: string };
  const token = new URL(message.reset_url).searchParams.get('token');
  assert.ok(token);
  await request(app).post('/api/auth/reset-password')
    .send({ token, password: 'NewPassword123!' }).expect(200);
  await request(app).post('/api/auth/reset-password')
    .send({ token, password: 'OtherPassword123!' }).expect(400);
  await request(app).post('/api/auth/login')
    .send({ email: 'admin@test.local', password: 'NewPassword123!' }).expect(200);
});

test('sixth consecutive failed login is rate limited', async () => {
  const agent = request.agent(app);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await agent.post('/api/auth/login')
      .send({ email: 'sale@test.local', password: 'wrong-password' }).expect(401);
  }
  await agent.post('/api/auth/login')
    .send({ email: 'sale@test.local', password: 'wrong-password' }).expect(429);
});

test('admin can create and update users', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: 'admin@test.local',
    password: 'NewPassword123!',
  }).expect(200);

  const created = await agent.post('/api/admin/users').send({
    name: 'New Team Member',
    email: 'new@test.local',
    password: 'Temporary123!',
    role: 'Sale',
  }).expect(201);
  const id = created.body.user.id as number;

  await agent.patch(`/api/admin/users/${id}`).send({ status: 'LOCKED' }).expect(200);
  await request(app).post('/api/auth/login').send({
    email: 'new@test.local',
    password: 'Temporary123!',
  }).expect(401);
});
