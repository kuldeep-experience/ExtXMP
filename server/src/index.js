import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { purgeAll } from './lib/history.js';

try {
  await connectDB();
} catch (err) {
  console.error('MongoDB connection failed:', err.message);
  process.exit(1);
}
app.listen(env.PORT, () => console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`));

// Delete history that is past each visitor's retention period, at startup and every 6 hours.
const sweep = () => purgeAll().catch((e) => console.error('[history] purge failed:', e.message));
sweep();
setInterval(sweep, 6 * 3600 * 1000).unref();
