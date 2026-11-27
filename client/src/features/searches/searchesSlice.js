import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorDetails, errorMessage } from '../../lib/api.js';

const thunk = (type, fn) =>
  createAsyncThunk(type, async (arg, { rejectWithValue }) => {
    try { return await fn(arg); } catch (e) { return rejectWithValue({ message: errorMessage(e), details: errorDetails(e) }); }
  });

export const fetchSearches = thunk('searches/list', async (params) => (await api.get('/saved-searches', { params })).data);
export const createSearch = thunk('searches/create', async (body) => (await api.post('/saved-searches', body)).data.data);
export const updateSearch = thunk('searches/update', async ({ id, ...body }) => (await api.patch(`/saved-searches/${id}`, body)).data.data);
export const deleteSearch = thunk('searches/delete', async (id) => { await api.delete(`/saved-searches/${id}`); return id; });
// Records the last-used date and returns the directory query that restores every filter. limit=1: the directory page loads the results itself.
export const runSearch = thunk('searches/run', async (id) => (await api.post(`/saved-searches/${id}/run`, null, { params: { limit: 1 } })).data);
export const fetchLocations = thunk('searches/locations', async () => (await api.get('/professionals/locations')).data.data);

const initialState = {
  list: { items: [], pagination: null, status: 'idle', error: null },
  locations: { items: [], status: 'idle' },
};

const slice = createSlice({
  name: 'searches',
  initialState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchSearches.pending, (s, a) => { s.list.status = 'loading'; s.list.error = null; s.list.requestId = a.meta.requestId; })
      .addCase(fetchSearches.fulfilled, (s, a) => { if (s.list.requestId === a.meta.requestId) { s.list.status = 'succeeded'; s.list.items = a.payload.data; s.list.pagination = a.payload.pagination; } })
      .addCase(fetchSearches.rejected, (s, a) => { if (s.list.requestId === a.meta.requestId) { s.list.status = 'failed'; s.list.error = a.payload?.message || a.error.message; } })
      .addCase(fetchLocations.fulfilled, (s, a) => { s.locations = { items: a.payload, status: 'ready' }; })
      .addCase(deleteSearch.fulfilled, (s, a) => { s.list.items = s.list.items.filter((i) => i._id !== a.payload); });
    // Never keep one visitor's searches in memory after logout or session expiry.
    b.addMatcher((a) => a.type === 'auth/logout/fulfilled' || a.type === 'auth/clearUser', () => initialState);
  },
});

export default slice.reducer;
