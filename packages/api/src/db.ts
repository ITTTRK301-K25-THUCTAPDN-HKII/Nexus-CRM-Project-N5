import mysql from 'mysql2/promise';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { config } from './config.js';

export const db = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  timezone: 'Z',
});

export async function query<T extends RowDataPacket[]>(sql: string, values: any[] = []): Promise<T> {
  const [rows] = await db.execute<T>(sql, values);
  return rows;
}

export async function execute(sql: string, values: any[] = []): Promise<ResultSetHeader> {
  const [result] = await db.execute<ResultSetHeader>(sql, values);
  return result;
}

export async function inTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
