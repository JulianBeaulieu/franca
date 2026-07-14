import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../src/db/pool';
import { orderMigrations } from '../src/lib/migrations';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, '..', 'db', 'migrations');

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const applied = new Set(
    (await pool.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(
      (r) => r.version,
    ),
  );

  const files = orderMigrations(readdirSync(dir));
  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied migration ${file}`);
      ran += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(ran === 0 ? 'Migrations up to date.' : `Applied ${String(ran)} migration(s).`);
  await pool.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
