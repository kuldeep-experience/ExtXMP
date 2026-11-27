import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorMessage } from '../../lib/api.js';

const thunk = (type, fn) =>
  createAsyncThunk(type, async (arg, { rejectWithValue }) => {
    try { return await fn(arg); } catch (e) { return rejectWithValue({ message: errorMessage(e) }); }
  });

export const fetchViewed = thunk('history/viewed', async (params) => (await api.get('/recently-viewed', { params })).data);
export const fetchSearchHistory = thunk('history/searches', async (params) => (await api.get('/search-history', { params })).data);
export const fetchComparisons = thunk('history/comparisons', async (params) => (await api.get('/recent-comparisons', { params })).data);
const urls = { viewed: '/recently-viewed', searches: '/search-history', comparisons: '/recent-comparisons' };
export const removeHistoryItem = thunk('history/remove', async ({ kind, id }) => { await api.delete(`${urls[kind]}/${id}`); return { kind, id }; });
export const clearHistory = thunk('history/clear', async (kinds) => {
  const results = await Promise.all(kinds.map((k) => api.delete(`${urls[k]}/clear`)));
  return { kinds, deleted: results.reduce((n, r) => n + r.data.deleted, 0) };
});

const section = () => ({ items: [], pagination: null, status: 'idle', error: null });
const initialState = { viewed: section(), searches: section(), comparisons: section() };

const slice = createSlice({
  name: 'history',
  initialState,
  reducers: {},
  extraReducers: (b) => {
    const track = (t, key) => b
      .addCase(t.pending, (s) => { s[key].status = s[key].items.length ? 'refreshing' : 'loading'; s[key].error = null; })
      .addCase(t.fulfilled, (s, { payload }) => { s[key] = { items: payload.data, pagination: payload.pagination ?? null, status: 'ready', error: null }; })
      .addCase(t.rejected, (s, { payload }) => { s[key].status = 'failed'; s[key].error = payload?.message; });
    track(fetchViewed, 'viewed'); track(fetchSearchHistory, 'searches'); track(fetchComparisons, 'comparisons');
    b.addCase(removeHistoryItem.fulfilled, (s, { payload }) => { s[payload.kind].items = s[payload.kind].items.filter((i) => i._id !== payload.id); });
    b.addCase(clearHistory.fulfilled, (s, { payload }) => { payload.kinds.forEach((k) => { s[k] = { ...section(), status: 'ready' }; }); });
    b.addMatcher((a) => a.type === 'auth/logout/fulfilled' || a.type === 'auth/clearUser', () => initialState);
  },
});
export default slice.reducer;
