import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { env } from '../config/env.js';
import Visitor, { toPublicVisitor } from '../models/Visitor.js';
import { ApiError } from '../middleware/error.js';
import { clearAuthCookie, requireAuth, requireRole, setAuthCookie } from '../middleware/auth.js';
import { issueCsrf } from '../middleware/csrf.js';
import { loginLimiter, sensitiveLimiter } from '../middleware/rateLimit.js';
import { hashToken, randomToken } from '../lib/tokens.js';
import { sendMail } from '../lib/mailer.js';
import { purgeForVisitor } from '../lib/history.js';

const router = Router();
const HOUR = 3600 * 1000;

// ---- schemas (strict: unknown fields such as "role" are rejected, not silently ignored) ----
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8, 'At least 8 characters').max(72, 'At most 72 characters')
  .regex(/[A-Za-z]/, 'Must contain a letter').regex(/\d/, 'Must contain a number');
const name = z.string().trim().min(1, 'Required').max(50);
const phone = z.string().trim().regex(/^[+()\d\s.-]{7,20}$/, 'Enter a valid phone number').or(z.literal(''));
const imageUrl = z.string().trim().max(500).refine((u) => /^https?:\/\//i.test(u) && URL.canParse(u), 'Must be an http(s) URL').or(z.literal(''));
const token = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid token');

const schemas = {
  register: z.strictObject({ firstName: name, lastName: name, email, password, phone: phone.optional() }),
  login: z.strictObject({ email, password: z.string().min(1).max(200) }),
  forgot: z.strictObject({ email }),
  reset: z.strictObject({ token, password }),
  verify: z.strictObject({ token }),
  changePassword: z.strictObject({ currentPassword: z.string().min(1).max(200), newPassword: password }),
  profile: z.strictObject({
    firstName: name.optional(),
    lastName: name.optional(),
    phone: phone.optional(),
    profileImage: imageUrl.nullable().optional(),
    notificationPreferences: z.strictObject({
      recommendations: z.boolean().optional(),
      productUpdates: z.boolean().optional(),
    }).optional(),
    privacySettings: z.strictObject({
      trackHistory: z.boolean().optional(),
      historyRetentionDays: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)]).optional(),
    }).optional(),
  }),
};

const hash = (pw) => bcrypt.hash(pw, env.BCRYPT_ROUNDS);
let dummyHash; // compared against when the email is unknown so response time does not reveal it
const getDummy = async () => (dummyHash ||= await hash('not-a-real-password-1'));

const session = (req, res, visitor, status = 200) => {
  setAuthCookie(res, visitor);
  res.status(status).json({ success: true, data: toPublicVisitor(visitor), csrfToken: issueCsrf(req, res) });
};

async function sendVerification(visitor) {
  const t = randomToken();
  await Visitor.updateOne({ _id: visitor._id }, { emailVerificationTokenHash: hashToken(t), emailVerificationExpires: new Date(Date.now() + 24 * HOUR) });
  await sendMail({
    to: visitor.email,
    subject: 'Verify your Experience.com email address',
    text: `Hi ${visitor.firstName}, confirm your email address to finish setting up your account. This link expires in 24 hours.`,
    link: `${env.CLIENT_URL}/verify-email?token=${t}`,
  });
}

// ---- public ----
router.get('/csrf', (req, res) => res.json({ success: true, csrfToken: issueCsrf(req, res) }));

router.post('/register', sensitiveLimiter, async (req, res) => {
  const data = schemas.register.parse(req.body);
  if (await Visitor.exists({ email: data.email })) {
    throw new ApiError(409, 'An account with this email already exists', { email: ['An account with this email already exists'] });
  }
  const visitor = await Visitor.create({
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone || undefined,
    passwordHash: await hash(data.password),
  });
  await sendVerification(visitor);
  session(req, res, visitor, 201);
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = schemas.login.parse(req.body);
  const visitor = await Visitor.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, visitor?.passwordHash ?? (await getDummy()));
  if (!visitor || !ok) throw new ApiError(401, 'Invalid email or password');
  if (visitor.accountStatus !== 'active') throw new ApiError(403, 'This account is not active');
  session(req, res, visitor);
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

router.post('/forgot-password', sensitiveLimiter, async (req, res) => {
  const { email } = schemas.forgot.parse(req.body);
  const visitor = await Visitor.findOne({ email, accountStatus: 'active' });
  if (visitor) {
    const t = randomToken();
    await Visitor.updateOne({ _id: visitor._id }, { passwordResetTokenHash: hashToken(t), passwordResetExpires: new Date(Date.now() + HOUR) });
    await sendMail({
      to: visitor.email,
      subject: 'Reset your Experience.com password',
      text: `Hi ${visitor.firstName}, use the link to choose a new password. It expires in 1 hour. If you did not request this, you can ignore this email.`,
      link: `${env.CLIENT_URL}/reset-password?token=${t}`,
    });
  }
  // Same response whether or not the account exists.
  res.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
});

router.post('/reset-password', sensitiveLimiter, async (req, res) => {
  const { token: t, password: pw } = schemas.reset.parse(req.body);
  const visitor = await Visitor.findOne({ passwordResetTokenHash: hashToken(t), passwordResetExpires: { $gt: new Date() }, accountStatus: 'active' });
  if (!visitor) throw new ApiError(400, 'This reset link is invalid or has expired');
  visitor.passwordHash = await hash(pw);
  visitor.passwordChangedAt = new Date();
  visitor.passwordResetTokenHash = undefined; // single use
  visitor.passwordResetExpires = undefined;
  await visitor.save();
  res.json({ success: true, message: 'Password updated. You can now log in.' });
});

router.post('/verify-email', sensitiveLimiter, async (req, res) => {
  const { token: t } = schemas.verify.parse(req.body);
  const visitor = await Visitor.findOne({ emailVerificationTokenHash: hashToken(t), emailVerificationExpires: { $gt: new Date() } });
  if (!visitor) throw new ApiError(400, 'This verification link is invalid or has expired');
  visitor.emailVerified = true;
  visitor.emailVerificationTokenHash = undefined;
  visitor.emailVerificationExpires = undefined;
  await visitor.save();
  res.json({ success: true, message: 'Email verified' });
});

// ---- private (authenticated visitor only; every query is scoped to req.visitor) ----
router.use(requireAuth, requireRole('visitor'));

router.get('/me', (req, res) => res.json({ success: true, data: toPublicVisitor(req.visitor) }));

router.post('/resend-verification', sensitiveLimiter, async (req, res) => {
  if (req.visitor.emailVerified) throw new ApiError(400, 'Email is already verified');
  await sendVerification(req.visitor);
  res.json({ success: true, message: 'Verification email sent' });
});

router.patch('/profile', async (req, res) => {
  const { notificationPreferences, privacySettings, ...rest } = schemas.profile.parse(req.body);
  const set = { ...rest };
  if ('phone' in set) set.phone = set.phone || undefined;
  if ('profileImage' in set) set.profileImage = set.profileImage || null;
  Object.entries(notificationPreferences || {}).forEach(([k, v]) => { set[`notificationPreferences.${k}`] = v; });
  Object.entries(privacySettings || {}).forEach(([k, v]) => { set[`privacySettings.${k}`] = v; });
  const visitor = await Visitor.findByIdAndUpdate(req.visitor._id, { $set: set }, { returnDocument: 'after', runValidators: true });
  if (privacySettings) await purgeForVisitor(visitor); // a shorter retention period takes effect immediately
  res.json({ success: true, data: toPublicVisitor(visitor) });
});

router.patch('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = schemas.changePassword.parse(req.body);
  const visitor = await Visitor.findById(req.visitor._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, visitor.passwordHash))) {
    throw new ApiError(400, 'Current password is incorrect', { currentPassword: ['Incorrect password'] });
  }
  if (currentPassword === newPassword) {
    throw new ApiError(400, 'Choose a different password', { newPassword: ['Must differ from the current password'] });
  }
  visitor.passwordHash = await hash(newPassword);
  visitor.passwordChangedAt = new Date();
  await visitor.save();
  session(req, res, visitor); // re-issue this session; all other sessions are invalidated
});

export default router;
