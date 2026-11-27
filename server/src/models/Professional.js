import mongoose from 'mongoose';

const professionalSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, index: true },
    profileImage: { type: String, default: null },
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true },
    categorySlug: { type: String, required: true, index: true },
    specializations: { type: [String], default: [], index: true },
    description: { type: String, required: true },
    yearsOfExperience: { type: Number, required: true, min: 0, index: true },
    location: { type: String, required: true }, // display string, e.g. "Austin, TX"
    city: { type: String, required: true, index: true },
    state: { type: String, required: true },
    country: { type: String, default: 'United States' },
    // GeoJSON point [lng, lat] used by the distance filter
    coordinates: { type: { type: String, enum: ['Point'] }, coordinates: { type: [Number] } },
    contactEmail: { type: String, required: true, lowercase: true },
    phone: { type: String },
    website: { type: String },
    // Derived from approved + visible reviews; maintained by the seed / review module.
    averageRating: { type: Number, default: 0, min: 0, max: 5, index: true },
    reviewCount: { type: Number, default: 0, min: 0, index: true },
    services: { type: [String], default: [] },
    qualifications: { type: [String], default: [] },
    verificationStatus: { type: String, enum: ['verified', 'unverified'], default: 'unverified', index: true },
    profileStatus: { type: String, enum: ['active', 'inactive', 'pending'], default: 'active', index: true },
  },
  { timestamps: true },
);

professionalSchema.index({ coordinates: '2dsphere' });

export default mongoose.model('Professional', professionalSchema);
