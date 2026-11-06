import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from './app.js';
import { db, execute, query } from './db.js';
import { revokeUserRefreshTokens } from './auth.js';

const app = createApp();

before(async () => {
  await execute('DELETE FROM users');
  await execute('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', ['Demo Admin', 'admin@test.local', bcrypt.hashSync('Password123!', 10), 'Admin']);
  await execute('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', ['Demo Sale', 'sale@test.local', bcrypt.hashSync('Password123!', 10), 'Sale']);
});

after(async () => {
  await db.end();
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
  const [user] = await query<(import('mysql2/promise').RowDataPacket & { id: number })[]>('SELECT id FROM users WHERE email = ?', ['admin@test.local']);
  await revokeUserRefreshTokens(user.id);
  await request(app).post('/api/auth/forgot-password').send({ email: 'admin@test.local' }).expect(200);
  const [message] = await query<(import('mysql2/promise').RowDataPacket & { reset_url: string })[]>('SELECT reset_url FROM dev_mailbox ORDER BY id DESC LIMIT 1');
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

test('qualified lead conversion creates an account and contact and soft-deletes the lead', async () => {
  const [sale] = await query<(import('mysql2/promise').RowDataPacket & { id: number })[]>(
    'SELECT id FROM users WHERE email = ?',
    ['sale@test.local'],
  );
  const uniqueValue = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `lead-${uniqueValue}@test.local`;
  const leadResult = await execute(
    `INSERT INTO leads (owner_user_id, name, company, email, phone, status)
     VALUES (?, ?, ?, ?, ?, 'QUALIFIED')`,
    [sale.id, 'Taylor Morgan', 'Acme Example', email, `+1555${uniqueValue.replace(/\D/g, '').slice(-7)}`],
  );
  const leadId = Number(leadResult.insertId);
  let accountId: number | undefined;

  try {
    const agent = request.agent(app);
    await agent.post('/api/auth/login')
      .send({ email: 'sale@test.local', password: 'Password123!' })
      .expect(200);
    const response = await agent.post(`/api/leads/${leadId}/convert`).expect(201);
    accountId = response.body.accountId as number;

    const [account] = await query<(import('mysql2/promise').RowDataPacket & { name: string; email: string })[]>(
      'SELECT name, email FROM accounts WHERE id = ?',
      [accountId],
    );
    assert.equal(account.name, 'Acme Example');
    assert.equal(account.email, email);

    const [contact] = await query<(import('mysql2/promise').RowDataPacket & {
      firstName: string;
      lastName: string;
      accountId: number;
      email: string;
    })[]>(
      'SELECT first_name AS firstName, last_name AS lastName, account_id AS accountId, email FROM contacts WHERE id = ?',
      [response.body.contactId],
    );
    assert.equal(contact.firstName, 'Taylor');
    assert.equal(contact.lastName, 'Morgan');
    assert.equal(contact.accountId, accountId);
    assert.equal(contact.email, email);

    const [lead] = await query<(import('mysql2/promise').RowDataPacket & {
      status: string;
      deletedAt: Date | null;
      accountId: number;
    })[]>(
      'SELECT status, deleted_at AS deletedAt, converted_account_id AS accountId FROM leads WHERE id = ?',
      [leadId],
    );
    assert.equal(lead.status, 'CONVERTED');
    assert.ok(lead.deletedAt);
    assert.equal(lead.accountId, accountId);
    await agent.post(`/api/leads/${leadId}/convert`).expect(409);
  } finally {
    await execute('DELETE FROM leads WHERE id = ?', [leadId]);
    if (accountId !== undefined) await execute('DELETE FROM accounts WHERE id = ?', [accountId]);
  }
});

test('sales user can manage owned accounts and their contacts', async () => {
  const uniqueValue = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let accountId: number | undefined;
  let contactId: number | undefined;

  try {
    const agent = request.agent(app);
    await agent.post('/api/auth/login')
      .send({ email: 'sale@test.local', password: 'Password123!' })
      .expect(200);

    const createdAccount = await agent.post('/api/accounts').send({
      name: `Account ${uniqueValue}`,
      industry: 'Technology',
      email: `account-${uniqueValue}@test.local`,
    }).expect(201);
    accountId = createdAccount.body.account.id as number;

    await agent.get(`/api/accounts/${accountId}`).expect(200);
    const accountList = await agent.get('/api/accounts').query({ search: uniqueValue }).expect(200);
    assert.equal(accountList.body.items.some((account: { id: number }) => account.id === accountId), true);
    await agent.patch(`/api/accounts/${accountId}`).send({ industry: 'Software' }).expect(200);
    await agent.put(`/api/accounts/${accountId}`).send({ name: `Updated ${uniqueValue}` }).expect(200);

    const createdContact = await agent.post('/api/contacts').send({
      accountId,
      firstName: 'Alex',
      lastName: 'Example',
      email: `contact-${uniqueValue}@test.local`,
      jobTitle: 'Engineer',
    }).expect(201);
    contactId = createdContact.body.contact.id as number;

    const contactList = await agent.get('/api/contacts').query({ accountId }).expect(200);
    assert.equal(contactList.body.items.some((contact: { id: number }) => contact.id === contactId), true);
    await agent.get(`/api/contacts/${contactId}`).expect(200);
    await agent.patch(`/api/contacts/${contactId}`).send({ jobTitle: 'Lead Engineer' }).expect(200);
    await agent.delete(`/api/contacts/${contactId}`).expect(204);
    contactId = undefined;

    await agent.delete(`/api/accounts/${accountId}`).expect(204);
    accountId = undefined;
  } finally {
    if (contactId !== undefined) await execute('DELETE FROM contacts WHERE id = ?', [contactId]);
    if (accountId !== undefined) await execute('DELETE FROM accounts WHERE id = ?', [accountId]);
  }
});
