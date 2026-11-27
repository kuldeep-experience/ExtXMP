import mongoose from 'mongoose';

const visitorSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    lastName: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    profileImage: { type: String, default: null },
    role: { type: String, enum: ['visitor'], default: 'visitor', immutable: true },
    accountStatus: { type: String, enum: ['active', 'suspended', 'deactivated'], default: 'active' },
    emailVerified: { type: Boolean, default: false },
    notificationPreferences: {
      recommendations: { type: Boolean, default: true },
      productUpdates: { type: Boolean, default: false },
    },
    // What the app may remember about browsing. Disclosed on the Settings page; history is private to the visitor.
    privacySettings: {
      trackHistory: { type: Boolean, default: true },
      historyRetentionDays: { type: Number, enum: [30, 90, 180, 365], default: 90 },
    },
    passwordChangedAt: { type: Date },
    // Only SHA-256 hashes of one-time tokens are stored, never the tokens themselves.
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true },
);

export const toPublicVisitor = (v) => ({
  _id: v._id,
  firstName: v.firstName,
  lastName: v.lastName,
  email: v.email,
  phone: v.phone ?? null,
  profileImage: v.profileImage ?? null,
  role: v.role,
  accountStatus: v.accountStatus,
  emailVerified: v.emailVerified,
  notificationPreferences: {
    recommendations: v.notificationPreferences?.recommendations ?? true,
    productUpdates: v.notificationPreferences?.productUpdates ?? false,
  },
  privacySettings: {
    trackHistory: v.privacySettings?.trackHistory ?? true,
    historyRetentionDays: v.privacySettings?.historyRetentionDays ?? 90,
  },
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
});

export default mongoose.model('Visitor', visitorSchema);
