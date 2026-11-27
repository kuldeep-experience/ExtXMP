import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';

const common = { standardHeaders: true, legacyHeaders: false };
const handler = (message) => (_req, res) => res.status(429).json({ success: false, message });

// Per IP + email, so one attacker cannot lock out everyone and one account cannot be brute-forced.
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email || '').toLowerCase()}`,
  handler: handler('Too many login attempts. Please try again in 15 minutes.'),
});

// Registration, forgot/reset password and verification emails.
export const sensitiveLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: env.SENSITIVE_RATE_LIMIT_MAX,
  handler: handler('Too many requests. Please try again later.'),
});

// AI recommendation requests cost money with a real provider: limit them per visitor.
export const aiLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: env.AI_RATE_LIMIT_MAX,
  keyGenerator: (req) => String(req.visitor?._id ?? ipKeyGenerator(req.ip)),
  handler: handler('You have reached the hourly limit for assistant requests. Please try again later.'),
});
