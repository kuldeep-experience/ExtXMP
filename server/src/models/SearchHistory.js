import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor', required: true },
  query: { type: String, default: '', maxlength: 100 },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} }, // the directory search parameters, so a search can be repeated exactly
  queryKey: { type: String, required: true }, // identical searches share one entry
  resultsCount: { type: Number, default: 0, min: 0 },
  searchedAt: { type: Date, required: true },
}, { minimize: false }); // keep an empty filters object ({}) instead of dropping it
schema.index({ visitor: 1, queryKey: 1 }, { unique: true });
schema.index({ visitor: 1, searchedAt: -1 });

export default mongoose.model('SearchHistory', schema);
