import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorDetails, errorMessage } from '../../lib/api.js';

const thunk = (type, fn) =>
  createAsyncThunk(type, async (arg, { rejectWithValue }) => {
    try { return await fn(arg); } catch (e) { return rejectWithValue({ message: errorMessage(e), details: errorDetails(e) }); }
  });

export const fetchServiceRecords = thunk('serviceRecords/list', async (params) => (await api.get('/service-records', { params })).data);
export const createServiceRecord = thunk('serviceRecords/create', async (body) => (await api.post('/service-records', body)).data.data);
export const updateServiceRecord = thunk('serviceRecords/update', async ({ id, ...body }) => (await api.patch(`/service-records/${id}`, body)).data.data);
export const deleteServiceRecord = thunk('serviceRecords/delete', async (id) => { await api.delete(`/service-records/${id}`); return id; });

const initialState = { items: [], pagination: null, totalSpentCents: 0, status: 'idle', error: null };

const slice = createSlice({
  name: 'serviceRecords',
  initialState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchServiceRecords.pending, (s) => { s.status = s.items.length ? 'refreshing' : 'loading'; s.error = null; })
      .addCase(fetchServiceRecords.fulfilled, (s, { payload }) => { Object.assign(s, { items: payload.data, pagination: payload.pagination, totalSpentCents: payload.totalSpentCents, status: 'ready', error: null }); })
      .addCase(fetchServiceRecords.rejected, (s, { payload, error }) => { s.status = 'failed'; s.error = payload?.message || error.message; })
      .addCase(deleteServiceRecord.fulfilled, (s, { payload }) => { s.items = s.items.filter((r) => r._id !== payload); });
    b.addMatcher((a) => a.type === 'auth/logout/fulfilled' || a.type === 'auth/clearUser', () => initialState);
  },
});
export default slice.reducer;
