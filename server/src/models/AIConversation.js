import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true, index: true },
    title: { type: String, trim: true, maxlength: 80, default: 'New conversation' },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
schema.index({ visitor: 1, lastMessageAt: -1 });

export default mongoose.model('AIConversation', schema);
