import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorDetails, errorMessage } from '../../lib/api.js';

const thunk = (type, fn) =>
  createAsyncThunk(type, async (arg, { rejectWithValue }) => {
    try { return await fn(arg); } catch (e) { return rejectWithValue({ message: errorMessage(e), details: errorDetails(e) }); }
  });

// "My Conversations" are the visitor's AI assistant conversations.
export const fetchConversationList = thunk('conversations/list', async ({ key = 'main', ...params }) => ({ key, ...(await api.get('/ai/conversations', { params })).data }));
export const renameConversation = thunk('conversations/rename', async ({ id, title }) => (await api.patch(`/ai/conversations/${id}`, { title })).data.data);
export const removeConversation = thunk('conversations/remove', async (id) => { await api.delete(`/ai/conversations/${id}`); return id; });

// ---- chat with professionals ----
export const fetchThreads = thunk('conversations/threads', async (params) => (await api.get('/conversations', { params })).data);
export const fetchThread = thunk('conversations/thread', async (id) => (await api.get(`/conversations/${id}`)).data.data);
export const fetchThreadMessages = thunk('conversations/threadMessages', async (id) => ({ id, messages: (await api.get(`/conversations/${id}/messages`, { params: { limit: 100 } })).data.data }));
export const sendThreadMessage = thunk('conversations/send', async ({ id, body }) => ({ id, message: (await api.post(`/conversations/${id}/messages`, { body })).data.data }));
export const startThread = thunk('conversations/start', async (body) => (await api.post('/conversations', body)).data);
export const markThreadRead = thunk('conversations/read', async (id) => { await api.post(`/conversations/${id}/read`); return id; });
export const deleteThread = thunk('conversations/deleteThread', async (id) => { await api.delete(`/conversations/${id}`); return id; });
export const fetchUnread = thunk('conversations/unread', async () => (await api.get('/conversations/unread-count')).data.count);

const empty = () => ({ items: [], pagination: null, status: 'idle', error: null });
const initialState = {
  lists: {}, // AI assistant conversations, by key
  threads: { items: [], pagination: null, status: 'idle', error: null },
  active: { thread: null, messages: [], status: 'idle', error: null },
  unread: 0,
};

const slice = createSlice({
  name: 'conversations',
  initialState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchConversationList.pending, (s, { meta }) => { const l = (s.lists[meta.arg.key ?? 'main'] ||= empty()); l.status = 'loading'; l.error = null; l.requestId = meta.requestId; })
      .addCase(fetchConversationList.fulfilled, (s, { payload, meta }) => { const l = s.lists[payload.key]; if (l.requestId === meta.requestId) { l.status = 'succeeded'; l.items = payload.data; l.pagination = payload.pagination; } })
      .addCase(fetchConversationList.rejected, (s, { payload, meta, error }) => { const l = s.lists[meta.arg.key ?? 'main']; if (l.requestId === meta.requestId) { l.status = 'failed'; l.error = payload?.message || error.message; } });
    b.addCase(fetchThreads.pending, (s) => { s.threads.status = s.threads.items.length ? 'refreshing' : 'loading'; s.threads.error = null; })
      .addCase(fetchThreads.fulfilled, (s, { payload }) => { s.threads = { items: payload.data, pagination: payload.pagination, status: 'ready', error: null }; })
      .addCase(fetchThreads.rejected, (s, { payload, error }) => { s.threads.status = 'failed'; s.threads.error = payload?.message || error.message; })
      .addCase(fetchThread.pending, (s) => { s.active = { thread: null, messages: [], status: 'loading', error: null }; })
      .addCase(fetchThread.fulfilled, (s, { payload }) => { s.active.thread = payload; })
      .addCase(fetchThread.rejected, (s, { payload }) => { s.active.status = 'failed'; s.active.error = payload?.message; })
      .addCase(fetchThreadMessages.fulfilled, (s, { payload }) => { if (s.active.thread?._id === payload.id) { s.active.messages = payload.messages; s.active.status = 'ready'; } })
      .addCase(fetchThreadMessages.rejected, (s, { payload }) => { s.active.status = 'failed'; s.active.error = payload?.message; })
      .addCase(sendThreadMessage.fulfilled, (s, { payload }) => { if (s.active.thread?._id === payload.id) s.active.messages.push(payload.message); })
      .addCase(markThreadRead.fulfilled, (s, { payload }) => {
        const t = s.threads.items.find((x) => x._id === payload);
        if (t) { s.unread = Math.max(0, s.unread - t.unreadCount); t.unreadCount = 0; }
        if (s.active.thread?._id === payload) s.active.thread.unreadCount = 0;
      })
      .addCase(deleteThread.fulfilled, (s, { payload }) => { s.threads.items = s.threads.items.filter((t) => t._id !== payload); })
      .addCase(fetchUnread.fulfilled, (s, { payload }) => { s.unread = payload; });
    b.addMatcher((a) => a.type === 'auth/logout/fulfilled' || a.type === 'auth/clearUser', () => initialState);
  },
});
export const selectConversations = (key = 'main') => (s) => s.conversations.lists[key] ?? empty();
export default slice.reducer;
