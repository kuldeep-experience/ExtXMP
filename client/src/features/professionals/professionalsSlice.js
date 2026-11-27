import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorMessage } from '../../lib/api.js';

const thunk = (type, fn) =>
  createAsyncThunk(type, async (arg, { rejectWithValue }) => {
    try { return await fn(arg); } catch (e) { return rejectWithValue(errorMessage(e)); }
  });

export const fetchProfessionals = thunk('professionals/list', async (params) => (await api.get('/professionals', { params })).data);
export const fetchFeatured = thunk('professionals/featured', async () => (await api.get('/professionals', { params: { sort: 'rating', verified: true, limit: 3 } })).data.data);
export const fetchCategories = thunk('professionals/categories', async () => (await api.get('/professionals/categories')).data.data);
export const fetchProfessional = thunk('professionals/detail', async (id) => (await api.get(`/professionals/${id}`)).data.data);
export const fetchReviews = thunk('professionals/reviews', async ({ id, ...params }) => (await api.get(`/professionals/${id}/reviews`, { params })).data);

const resource = (extra = {}) => ({ status: 'idle', error: null, ...extra });
const wire = (builder, t, key, onOk, onPending) => builder
  .addCase(t.pending, (s, a) => { s[key].status = 'loading'; s[key].error = null; s[key].requestId = a.meta.requestId; onPending?.(s[key]); })
  .addCase(t.fulfilled, (s, a) => { if (s[key].requestId === a.meta.requestId) { s[key].status = 'succeeded'; onOk(s[key], a.payload); } })
  .addCase(t.rejected, (s, a) => { if (s[key].requestId === a.meta.requestId) { s[key].status = 'failed'; s[key].error = a.payload || a.error.message; } });

const slice = createSlice({
  name: 'professionals',
  initialState: {
    list: resource({ items: [], pagination: null }),
    featured: resource({ items: [] }),
    categories: resource({ items: [] }),
    detail: resource({ item: null }),
    reviews: resource({ items: [], pagination: null, summary: null }),
  },
  reducers: {},
  extraReducers: (b) => {
    wire(b, fetchProfessionals, 'list', (r, p) => { r.items = p.data; r.pagination = p.pagination; });
    wire(b, fetchFeatured, 'featured', (r, p) => { r.items = p; });
    wire(b, fetchCategories, 'categories', (r, p) => { r.items = p; });
    // Clear the previous profile immediately when switching to another one.
    wire(b, fetchProfessional, 'detail', (r, p) => { r.item = p; }, (r) => { r.item = null; });
    wire(b, fetchReviews, 'reviews', (r, p) => { r.items = p.data; r.pagination = p.pagination; r.summary = p.summary; });
  },
});

export default slice.reducer;
