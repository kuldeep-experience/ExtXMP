import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).default(480),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(1500), // all API requests per IP per 15 minutes
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  SENSITIVE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
  // AI assistant. Without AI_PROVIDER + AI_API_KEY + AI_MODEL the assistant runs in a labelled demo mode (built-in rules).
  AI_PROVIDER: z.enum(['demo', 'openai', 'openrouter', 'anthropic']).default('demo'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_BASE_URL: z.string().url().optional(), // any OpenAI-compatible endpoint
  AI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30), // recommendation requests per visitor per hour
  // Review insights: regenerate after this many new public reviews, and at most once per cooldown.
  REVIEW_INSIGHTS_MIN_NEW_REVIEWS: z.coerce.number().int().min(1).default(5),
  REVIEW_INSIGHTS_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(600),
  // Repeat views of a profile within this many minutes refresh the timestamp but do not add a view.
  RECENTLY_VIEWED_DEDUP_MINUTES: z.coerce.number().int().min(0).default(30),
  // 'dev' writes emails to a local dev-only outbox; 'none' sends nothing. Forced to 'none' in production.
  EMAIL_MODE: z.enum(['dev', 'none']).default('dev'),
  AUTO_SEED: z.enum(['true', 'false']).default('true'), // seed demo data at startup when the database is empty (never in production)
  CLIENT_URL: z.string().url().optional(), // base for links in emails and the CORS origin
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
// `npm start` passes --serve-client: Express serves the built React app, so everything runs on one port.
const SERVE_CLIENT = process.argv.includes('--serve-client');

export const env = {
  ...parsed.data,
  SERVE_CLIENT,
  CLIENT_URL: parsed.data.CLIENT_URL ?? (SERVE_CLIENT ? `http://localhost:${parsed.data.PORT}` : 'http://localhost:5173'),
  EMAIL_MODE: parsed.data.NODE_ENV === 'production' ? 'none' : parsed.data.EMAIL_MODE,
  AUTO_SEED: parsed.data.NODE_ENV === 'production' ? false : parsed.data.AUTO_SEED === 'true',
};
