import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true },
  professional: { type: mongoose.Schema.Types.ObjectId, ref: 'Professional', required: true },
  firstViewedAt: { type: Date, required: true },
  lastViewedAt: { type: Date, required: true },
  viewCount: { type: Number, default: 1, min: 1 },
});
schema.index({ visitor: 1, professional: 1 }, { unique: true }); // one entry per professional
schema.index({ visitor: 1, lastViewedAt: -1 });

export default mongoose.model('RecentlyViewedProfessional', schema);
