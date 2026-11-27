import mongoose from 'mongoose';

// A visitor's private record of a past experience with a professional. It is not a public review.
const schema = new mongoose.Schema(
  {
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true },
    professional: { type: mongoose.Schema.Types.ObjectId, ref: 'Professional', required: true },
    serviceUsed: { type: String, trim: true, required: true, maxlength: 100 },
    experienceDate: { type: Date, required: true },
    rating: { type: Number, min: 1, max: 5, default: null }, // the visitor's own private rating
    wouldRecommend: { type: String, enum: ['yes', 'no', 'unsure'], default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true },
);
schema.index({ visitor: 1, experienceDate: -1 });

export default mongoose.model('ExperienceEntry', schema);
