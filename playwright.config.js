import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive the real UI in Chromium against the real backend and a dedicated MongoDB database.
// `npm run test:e2e` builds the client, starts the single-process app on port 5100 and seeds the database first.
export const E2E_DB = 'mongodb://127.0.0.1:27017/evp_e2e';
const PORT = 5100;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 1, // the specs share one database
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e-results/results.json' }]],
  globalSetup: './e2e/global-setup.js',
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 800 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'npm run build --prefix client && npm start --prefix server',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT), MONGODB_URI: E2E_DB, NODE_ENV: 'development',
      LOGIN_RATE_LIMIT_MAX: '1000', SENSITIVE_RATE_LIMIT_MAX: '1000', AI_RATE_LIMIT_MAX: '1000', API_RATE_LIMIT_MAX: '100000',
      REVIEW_INSIGHTS_COOLDOWN_SECONDS: '0', BCRYPT_ROUNDS: '6',
    },
  },
});
