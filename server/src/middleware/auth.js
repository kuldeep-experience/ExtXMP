import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import Visitor from '../models/Visitor.js';
import { ApiError } from './error.js';

export const TOKEN_COOKIE = 'evp_token';
const maxAge = env.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000;
const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/' };

export function setAuthCookie(res, visitor) {
  const token = jwt.sign({ role: visitor.role }, env.JWT_SECRET, {
    subject: String(visitor._id),
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
    algorithm: 'HS256',
  });
  res.cookie(TOKEN_COOKIE, token, { ...cookieOpts, maxAge });
}
export const clearAuthCookie = (res) => res.clearCookie(TOKEN_COOKIE, cookieOpts);

export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[TOKEN_COOKIE];
  if (!token) throw new ApiError(401, 'Authentication required');
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw new ApiError(401, 'Session expired. Please log in again.');
  }
  const visitor = await Visitor.findById(payload.sub);
  if (!visitor) throw new ApiError(401, 'Authentication required');
  if (visitor.accountStatus !== 'active') throw new ApiError(403, 'This account is not active');
  // Tokens issued before the last password change are no longer valid.
  if (visitor.passwordChangedAt && Math.floor(visitor.passwordChangedAt.getTime() / 1000) > payload.iat) {
    throw new ApiError(401, 'Session expired. Please log in again.');
  }
  req.visitor = visitor;
  next();
}

// Role comes from the database record, never from the token or request body.
export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.visitor?.role)) throw new ApiError(403, 'You do not have access to this resource');
  next();
};
