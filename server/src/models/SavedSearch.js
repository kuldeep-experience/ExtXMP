import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameKey: { type: String, required: true }, // lowercase name, unique per visitor
    category: { type: String, default: null }, // category slug from the directory
    location: { type: String, trim: true, maxlength: 100, default: '' }, // city / state text, or a label for the coordinates
    latitude: { type: Number, min: -90, max: 90, default: null },
    longitude: { type: Number, min: -180, max: 180, default: null },
    radiusKm: { type: Number, min: 1, max: 500, default: null },
    maxDistanceKm: { type: Number, min: 1, max: 500, default: null },
    minRating: { type: Number, min: 0, max: 5, default: null },
    specializations: { type: [String], default: [] },
    serviceRequirements: { type: [String], default: [] },
    additionalFilters: {
      keyword: { type: String, trim: true, maxlength: 100, default: '' },
      minExperience: { type: Number, min: 0, max: 80, default: null },
      verifiedOnly: { type: Boolean, default: false },
      sort: { type: String, enum: ['rating', 'reviews', 'experience', 'name'], default: 'rating' },
    },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
schema.index({ visitor: 1, nameKey: 1 }, { unique: true });

export default mongoose.model('SavedSearch', schema);
