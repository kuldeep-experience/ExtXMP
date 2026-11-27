import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    professional: { type: mongoose.Schema.Types.ObjectId, ref: 'Professional', required: true },
    reviewerName: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, trim: true },
    text: { type: String, required: true },
    serviceCategory: { type: String },
    reviewDate: { type: Date, default: Date.now },
    moderationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    visibility: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
  },
  { timestamps: true },
);
reviewSchema.index({ professional: 1, moderationStatus: 1, visibility: 1, reviewDate: -1 });

export const PUBLIC_REVIEW = { moderationStatus: 'approved', visibility: 'visible' };
export default mongoose.model('Review', reviewSchema);
