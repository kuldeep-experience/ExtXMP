import mongoose from 'mongoose';

// A chat between a visitor and a professional. (AI assistant conversations are a separate model.)
const schema = new mongoose.Schema(
  {
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true },
    professional: { type: mongoose.Schema.Types.ObjectId, ref: 'Professional', required: true },
    subject: { type: String, trim: true, maxlength: 100, default: '' },
    messageCount: { type: Number, default: 0 },
    unreadCount: { type: Number, default: 0 }, // messages from the professional the visitor has not read
    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: { type: String, default: '' },
  },
  { timestamps: true },
);
schema.index({ visitor: 1, professional: 1 }, { unique: true }); // one thread per professional
schema.index({ visitor: 1, lastMessageAt: -1 });

export default mongoose.model('Conversation', schema);
