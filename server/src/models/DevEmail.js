import mongoose from 'mongoose';

// DEVELOPMENT ONLY outbox. Used when EMAIL_MODE=dev so verification/reset links can be opened without an email provider.
const schema = new mongoose.Schema({
  to: { type: String, required: true, index: true },
  subject: String,
  text: String,
  link: String,
  createdAt: { type: Date, default: Date.now, expires: 86400 }, // auto-delete after 24h
});

export default mongoose.model('DevEmail', schema);
