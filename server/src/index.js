import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { purgeAll } from './lib/history.js';
import Professional from './models/Professional.js';
import { seed } from './seed/index.js';

try {
  await connectDB();
} catch (err) {
  console.error('MongoDB connection failed:', err.message);
  process.exit(1);
}
// First run: an empty database gets the demo data automatically. A database that already has data is never touched
// (running `npm run seed` by hand is what resets it).
if (env.AUTO_SEED && (await Professional.estimatedDocumentCount()) === 0) {
  console.log('Empty database: seeding demo data (set AUTO_SEED=false to disable)...');
  try { await seed(); console.log('Demo data ready. Log in with emma.carter@example.com / Demo@12345'); } catch (err) { console.error('Auto-seed failed:', err.message); }
}
app.listen(env.PORT, () => console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`));

// Delete history that is past each visitor's retention period, at startup and every 6 hours.
const sweep = () => purgeAll().catch((e) => console.error('[history] purge failed:', e.message));
sweep();
setInterval(sweep, 6 * 3600 * 1000).unref();
