import mongoose from 'mongoose';

// One assistant turn: what was asked, what was understood, which real professionals were returned and why.
const recommendation = new mongoose.Schema({
  professional: { type: mongoose.Schema.Types.ObjectId, ref: 'Professional', required: true },
  score: Number,
  matched: [String],
  unmet: [String],
  explanation: String, // built from database facts
  aiExplanation: { type: String, default: null }, // optional model wording, only kept if it passes the grounding check
}, { _id: false });

const schema = new mongoose.Schema(
  {
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true, index: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'AIConversation', required: true, index: true },
    userMessage: { type: String, required: true },
    assistantResponse: { type: String, required: true },
    criteria: { type: mongoose.Schema.Types.Mixed, default: {} }, // validated extracted criteria (after merging with the conversation so far)
    directoryQuery: { type: mongoose.Schema.Types.Mixed, default: {} }, // parameters sent to the directory search (never contains coordinates)
    recommendations: [recommendation],
    totalCandidates: { type: Number, default: 0 },
    relaxed: [String], // constraints dropped to find results
    mode: { type: String, enum: ['demo', 'live'], required: true },
    note: { type: String, default: null }, // e.g. provider fallback
    outcome: { type: String, enum: ['results', 'empty', 'needs_location', 'unclear', 'clarify'], required: true },
  },
  { timestamps: true },
);

export default mongoose.model('RecommendationSearch', schema);
