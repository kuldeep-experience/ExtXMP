import { env } from '../config/env.js';
import { randomToken, safeEqual } from '../lib/tokens.js';
import { ApiError } from './error.js';

export const CSRF_COOKIE = 'evp_csrf';
const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/' };

// Double-submit token: the cookie is HttpOnly, the client learns the value from GET /api/auth/csrf
// and echoes it in the x-csrf-token header on every state-changing request.
export function issueCsrf(req, res) {
  const existing = req.cookies?.[CSRF_COOKIE];
  const token = /^[a-f0-9]{64}$/.test(existing || '') ? existing : randomToken();
  res.cookie(CSRF_COOKIE, token, cookieOpts);
  return token;
}

export function csrfProtection(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !safeEqual(cookie, header)) {
    return next(new ApiError(403, 'Invalid or missing CSRF token', undefined, 'CSRF'));
  }
  next();
}
