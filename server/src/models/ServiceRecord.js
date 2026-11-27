import mongoose from 'mongoose';

// A record of a service a professional performed (or is performing) for the visitor.
const schema = new mongoose.Schema(
  {
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true },
    professional: { type: mongoose.Schema.Types.ObjectId, ref: 'Professional', required: true },
    experience: { type: mongoose.Schema.Types.ObjectId, ref: 'ExperienceEntry', default: null },
    serviceName: { type: String, trim: true, required: true, maxlength: 100 },
    serviceDate: { type: Date, required: true },
    status: { type: String, enum: ['planned', 'in_progress', 'completed'], default: 'completed' },
    amountCents: { type: Number, min: 0, default: null }, // what it cost, if the visitor wants to track it
    currency: { type: String, default: 'USD' },
    summary: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true },
);
schema.index({ visitor: 1, serviceDate: -1 });

export default mongoose.model('ServiceRecord', schema);
