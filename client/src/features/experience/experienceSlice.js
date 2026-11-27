import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorDetails, errorMessage } from '../../lib/api.js';

const thunk = (type, fn) =>
  createAsyncThunk(type, async (arg, { rejectWithValue }) => {
    try { return await fn(arg); } catch (e) { return rejectWithValue({ message: errorMessage(e), details: errorDetails(e) }); }
  });

export const fetchExperiences = thunk('experience/list', async ({ key = 'main', ...params }) => ({ key, ...(await api.get('/experience-history', { params })).data }));
export const createExperience = thunk('experience/create', async (body) => (await api.post('/experience-history', body)).data.data);
export const updateExperience = thunk('experience/update', async ({ id, ...body }) => (await api.patch(`/experience-history/${id}`, body)).data.data);
export const deleteExperience = thunk('experience/delete', async (id) => { await api.delete(`/experience-history/${id}`); return id; });

export const fetchTimeline = thunk('experience/timeline', async (params) => (await api.get('/experience-history/timeline', { params })).data);

const empty = () => ({ items: [], pagination: null, status: 'idle', error: null });
const initialState = { lists: {}, timeline: { items: [], pagination: null, status: 'idle', error: null } };

const slice = createSlice({
  name: 'experience',
  initialState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchExperiences.pending, (s, { meta }) => { const l = (s.lists[meta.arg.key ?? 'main'] ||= empty()); l.status = 'loading'; l.error = null; l.requestId = meta.requestId; })
      .addCase(fetchExperiences.fulfilled, (s, { payload, meta }) => { const l = s.lists[payload.key]; if (l.requestId === meta.requestId) { l.status = 'succeeded'; l.items = payload.data; l.pagination = payload.pagination; } })
      .addCase(fetchExperiences.rejected, (s, { payload, meta, error }) => { const l = s.lists[meta.arg.key ?? 'main']; if (l.requestId === meta.requestId) { l.status = 'failed'; l.error = payload?.message || error.message; } });
    b.addCase(fetchTimeline.pending, (s) => { s.timeline.status = s.timeline.items.length ? 'refreshing' : 'loading'; s.timeline.error = null; })
      .addCase(fetchTimeline.fulfilled, (s, { payload }) => { s.timeline = { items: payload.data, pagination: payload.pagination, status: 'ready', error: null }; })
      .addCase(fetchTimeline.rejected, (s, { payload, error }) => { s.timeline.status = 'failed'; s.timeline.error = payload?.message || error.message; });
    b.addMatcher((a) => a.type === 'auth/logout/fulfilled' || a.type === 'auth/clearUser', () => initialState);
  },
});
export const selectExperiences = (key = 'main') => (s) => s.experience.lists[key] ?? empty();
export default slice.reducer;
