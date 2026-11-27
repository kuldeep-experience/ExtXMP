import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorDetails, errorMessage } from '../../lib/api.js';

const thunk = (type, fn) =>
  createAsyncThunk(type, async (arg, { rejectWithValue }) => {
    try { return await fn(arg); } catch (e) { return rejectWithValue({ message: errorMessage(e), details: errorDetails(e) }); }
  });

// Loaded once per login; lets every card know whether it is bookmarked.
export const fetchSavedIds = createAsyncThunk('saved/ids', async (_, { rejectWithValue }) => {
  try { return (await api.get('/saved-professionals/ids')).data.data; } catch (e) { return rejectWithValue({ message: errorMessage(e) }); }
}, { condition: (_, { getState }) => getState().saved.ids.status === 'idle' });

export const fetchSaved = thunk('saved/list', async (params) => (await api.get('/saved-professionals', { params })).data);
export const fetchFolders = thunk('saved/folders', async () => (await api.get('/saved-folders')).data);
export const saveProfessional = thunk('saved/save', async (body) => (await api.post('/saved-professionals', body)).data.data);
export const updateSaved = thunk('saved/update', async ({ id, ...body }) => (await api.patch(`/saved-professionals/${id}`, body)).data.data);
export const removeSaved = thunk('saved/remove', async ({ id, professionalId }) => { await api.delete(`/saved-professionals/${id}`); return { id, professionalId }; });
export const createFolder = thunk('saved/folderCreate', async (body) => (await api.post('/saved-folders', body)).data.data);
export const updateFolder = thunk('saved/folderUpdate', async ({ id, ...body }) => (await api.patch(`/saved-folders/${id}`, body)).data.data);
export const deleteFolder = thunk('saved/folderDelete', async (id) => (await api.delete(`/saved-folders/${id}`)).data);

const initialState = {
  ids: { map: {}, status: 'idle' }, // professionalId -> saved record id
  list: { items: [], pagination: null, status: 'idle', error: null },
  folders: { items: [], totals: { all: 0, unfiled: 0 }, status: 'idle', error: null },
};

const slice = createSlice({
  name: 'saved',
  initialState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchSavedIds.pending, (s) => { s.ids.status = 'loading'; })
      .addCase(fetchSavedIds.fulfilled, (s, { payload }) => { s.ids = { map: payload, status: 'ready' }; })
      .addCase(fetchSavedIds.rejected, (s) => { s.ids.status = 'idle'; })
      .addCase(saveProfessional.fulfilled, (s, { payload }) => { s.ids.map[payload.professional._id] = payload._id; })
      .addCase(removeSaved.fulfilled, (s, { payload }) => {
        delete s.ids.map[payload.professionalId];
        s.list.items = s.list.items.filter((i) => i._id !== payload.id);
      })
      .addCase(updateSaved.fulfilled, (s, { payload }) => { s.list.items = s.list.items.map((i) => (i._id === payload._id ? payload : i)); });

    const track = (t, key, onOk) => b
      .addCase(t.pending, (s, a) => { s[key].status = 'loading'; s[key].error = null; s[key].requestId = a.meta.requestId; })
      .addCase(t.fulfilled, (s, a) => { if (s[key].requestId === a.meta.requestId) { s[key].status = 'succeeded'; onOk(s[key], a.payload); } })
      .addCase(t.rejected, (s, a) => { if (s[key].requestId === a.meta.requestId) { s[key].status = 'failed'; s[key].error = a.payload?.message || a.error.message; } });
    track(fetchSaved, 'list', (r, p) => { r.items = p.data; r.pagination = p.pagination; });
    track(fetchFolders, 'folders', (r, p) => { r.items = p.data; r.totals = p.totals; });

    // Never keep one visitor's saved data in memory after they log out or the session ends.
    b.addMatcher((a) => a.type === 'auth/logout/fulfilled' || a.type === 'auth/clearUser', () => initialState);
  },
});

export default slice.reducer;
