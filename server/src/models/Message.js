import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true }, // the participant that owns the thread, for access checks
    professional: { type: mongoose.Schema.Types.ObjectId, ref: 'Professional', required: true },
    senderType: { type: String, enum: ['visitor', 'professional'], required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date, default: null }, // only meaningful for messages from the professional
  },
  { timestamps: true },
);
schema.index({ conversation: 1, createdAt: 1 });

export default mongoose.model('Message', schema);
