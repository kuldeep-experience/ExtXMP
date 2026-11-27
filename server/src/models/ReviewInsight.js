import mongoose from 'mongoose';

// Cached analysis of one professional's public reviews. Every item cites the reviews it is based on.
const schema = new mongoose.Schema(
  {
    professional: { type: mongoose.Schema.Types.ObjectId, ref: 'Professional', required: true, unique: true },
    summary: { type: mongoose.Schema.Types.Mixed, default: null }, // { text, averageRating, reviewCount, distribution, dateRange }
    positiveFeedback: { type: [mongoose.Schema.Types.Mixed], default: [] },
    strengths: { type: [mongoose.Schema.Types.Mixed], default: [] },
    concerns: { type: [mongoose.Schema.Types.Mixed], default: [] },
    recentTrends: { type: [mongoose.Schema.Types.Mixed], default: [] },
    services: { type: [mongoose.Schema.Types.Mixed], default: [] },
    experienceThemes: { type: [mongoose.Schema.Types.Mixed], default: [] },
    reviewsAnalyzed: { type: Number, default: 0 },
    sourceReviewIds: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // every review that was analyzed
    generatedAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    generationStatus: { type: String, enum: ['generating', 'ready', 'failed'], default: 'generating' },
    mode: { type: String, enum: ['demo', 'live'], default: 'demo' },
    provider: { type: String, default: null }, // label of the provider that wrote it, e.g. "Demo analyzer"
    model: { type: String, default: null },
    note: { type: String, default: null }, // e.g. "fell back to the demo analyzer"
    error: { type: String, default: null },
  },
  { timestamps: true }, // updatedAt = last updated
);

export default mongoose.model('ReviewInsight', schema);
