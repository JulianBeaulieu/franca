import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://franca:franca@localhost:5432/franca';

export const pool = new Pool({ connectionString });

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
