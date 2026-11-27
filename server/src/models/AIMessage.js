import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'AIConversation', required: true },
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 4000 },
    search: { type: mongoose.Schema.Types.ObjectId, ref: 'RecommendationSearch', default: null }, // set on assistant messages
  },
  { timestamps: true },
);
schema.index({ conversation: 1, createdAt: 1 });

export default mongoose.model('AIMessage', schema);
