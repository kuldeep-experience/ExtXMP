import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorMessage } from '../../lib/api.js';

const thunk = (type, fn) =>
  createAsyncThunk(type, async (arg, { rejectWithValue }) => {
    try { return await fn(arg); } catch (e) { return rejectWithValue({ message: errorMessage(e) }); }
  });

export const fetchInsight = thunk('insights/fetch', async (professionalId) => ({ professionalId, body: (await api.get(`/review-insights/professional/${professionalId}`)).data }));
export const generateInsight = thunk('insights/generate', async (professionalId) => ({ professionalId, body: (await api.post(`/review-insights/professional/${professionalId}/generate`)).data }));
export const fetchMyInsights = thunk('insights/mine', async () => (await api.get('/review-insights/mine')).data.data);
// Original reviews behind an insight. Returned to the caller; they are not kept in the store.
export const fetchInsightSources = thunk('insights/sources', async ({ professionalId, ids }) => (await api.get(`/review-insights/professional/${professionalId}/sources`, { params: { ids: ids.join(','), limit: 50 } })).data.data);

const initialState = {
  byProfessional: {}, // professionalId -> { status, body, error }
  mine: { rows: [], status: 'idle', error: null },
};

const slice = createSlice({
  name: 'insights',
  initialState,
  reducers: { resetInsight: (s, { payload }) => { delete s.byProfessional[payload]; } },
  extraReducers: (b) => {
    b.addCase(fetchInsight.pending, (s, { meta }) => { const e = (s.byProfessional[meta.arg] ||= { status: 'loading', body: null, error: null }); if (!e.body) e.status = 'loading'; })
      .addCase(fetchInsight.fulfilled, (s, { payload }) => { s.byProfessional[payload.professionalId] = { status: payload.body.status, body: payload.body, error: null }; })
      .addCase(fetchInsight.rejected, (s, { payload, meta }) => { s.byProfessional[meta.arg] = { status: 'error', body: null, error: payload?.message }; })
      .addCase(generateInsight.fulfilled, (s, { payload }) => { s.byProfessional[payload.professionalId] = { status: payload.body.status, body: payload.body, error: null }; })
      .addCase(fetchMyInsights.pending, (s) => { if (!s.mine.rows.length) s.mine.status = 'loading'; })
      .addCase(fetchMyInsights.fulfilled, (s, { payload }) => { s.mine = { rows: payload, status: 'ready', error: null }; })
      .addCase(fetchMyInsights.rejected, (s, { payload }) => { s.mine = { rows: [], status: 'failed', error: payload?.message }; });
    b.addMatcher((a) => a.type === 'auth/logout/fulfilled' || a.type === 'auth/clearUser', () => initialState);
  },
});
export const { resetInsight } = slice.actions;
export default slice.reducer;
