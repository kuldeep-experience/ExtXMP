import { execFileSync } from 'node:child_process';
import { E2E_DB } from '../playwright.config.js';

// Reset the e2e database to the standard demo data before the run.
export default function globalSetup() {
  execFileSync('node', ['--env-file-if-exists=server/.env', 'server/src/seed/index.js'], {
    env: { ...process.env, MONGODB_URI: E2E_DB, BCRYPT_ROUNDS: '6' }, stdio: 'inherit',
  });
}
