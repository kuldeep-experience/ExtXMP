import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true, index: true },
    professional: { type: mongoose.Schema.Types.ObjectId, ref: 'Professional', required: true },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: 'SavedFolder', default: null }, // null = unfiled
    note: { type: String, trim: true, maxlength: 1000, default: '' }, // private to the visitor
  },
  { timestamps: true }, // createdAt = saved date
);
schema.index({ visitor: 1, professional: 1 }, { unique: true }); // no duplicate saves
schema.index({ visitor: 1, folder: 1 });

export default mongoose.model('SavedProfessional', schema);
