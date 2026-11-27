import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    nameKey: { type: String, required: true }, // lowercase name: folder names are unique per visitor, ignoring case
    description: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { timestamps: true },
);
schema.index({ visitor: 1, nameKey: 1 }, { unique: true });

export default mongoose.model('SavedFolder', schema);
