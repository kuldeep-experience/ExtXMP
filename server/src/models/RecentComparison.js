import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true },
  professionals: { type: [mongoose.Schema.Types.ObjectId], ref: 'Professional', validate: (v) => v.length >= 2 && v.length <= 4 },
  setKey: { type: String, required: true }, // sorted ids: the same set compared in any order is one entry
  comparedAt: { type: Date, required: true },
});
schema.index({ visitor: 1, setKey: 1 }, { unique: true });
schema.index({ visitor: 1, comparedAt: -1 });

export default mongoose.model('RecentComparison', schema);
