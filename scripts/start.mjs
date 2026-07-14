import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';

const url = process.env.DATABASE_URL ?? 'postgres://franca:franca@db:5432/franca';

// Refuse to boot a production-looking deployment on the committed dev AUTH_SECRET.
// The bundled Dex issuer is the only context where the dev default is acceptable
// (local `docker compose up`); any other OIDC_ISSUER means a real IdP is wired up
// and the secret MUST be overridden, or every forged/known-secret session is
// trivially decryptable. Keep this before any DB/migration work so it fails fast.
const DEV_AUTH_SECRET = 'dev-only-secret-change-me-0123456789abcdef'; // matches docker-compose.yml default
const BUNDLED_DEX_ISSUER = 'http://dex:5556/dex';
if (process.env.AUTH_SECRET === DEV_AUTH_SECRET && process.env.OIDC_ISSUER !== BUNDLED_DEX_ISSUER) {
  console.error(
    'FATAL: AUTH_SECRET is the committed dev default but OIDC_ISSUER is not the bundled Dex issuer\n' +
      `  (OIDC_ISSUER=${process.env.OIDC_ISSUER ?? '(unset)'}).\n` +
      'This looks like a real deployment using the insecure dev secret — refusing to start.\n' +
      'Set a strong AUTH_SECRET, e.g.  AUTH_SECRET=$(openssl rand -base64 33)',
  );
  process.exit(1);
}

async function waitForDb() {
  for (let attempt = 1; attempt <= 60; attempt++) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.end();
      console.log('Database is ready.');
      return;
    } catch {
      await client.end().catch(() => {});
      console.log(`Waiting for database (${attempt})…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Database never became ready.');
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
}

await waitForDb();
run('npx', ['tsx', 'scripts/migrate.ts']);
run('npx', ['tsx', 'scripts/seed.ts']);
console.log('Starting Next.js…');
const server = spawn('npx', ['next', 'start', '-p', '3000'], { stdio: 'inherit', env: process.env });
server.on('exit', (code) => process.exit(code ?? 0));
