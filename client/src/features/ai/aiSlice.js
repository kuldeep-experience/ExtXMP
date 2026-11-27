import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorDetails, errorMessage } from '../../lib/api.js';

const thunk = (type, fn) =>
  createAsyncThunk(type, async (arg, { rejectWithValue }) => {
    try { return await fn(arg); } catch (e) { return rejectWithValue({ message: errorMessage(e), details: errorDetails(e) }); }
  });

export const fetchAiStatus = thunk('ai/status', async () => (await api.get('/ai/status')).data.data);
export const fetchConversations = thunk('ai/conversations', async () => (await api.get('/ai/conversations', { params: { limit: 50 } })).data.data);
export const fetchMessages = thunk('ai/messages', async (id) => ({ id, messages: (await api.get(`/ai/conversations/${id}/messages`)).data.data }));
// { message, conversationId?, location? }
export const sendMessage = thunk('ai/send', async (body) => (await api.post('/ai/recommendations', body)).data.data);

const initialState = {
  mode: { mode: null, label: null, model: null }, // demo | live, loaded from the server
  conversations: { items: [], status: 'idle' },
  active: { id: null, messages: [], status: 'idle', error: null },
  sending: false,
  sendError: null,
};

const slice = createSlice({
  name: 'ai',
  initialState,
  reducers: {
    selectConversation: (s, { payload }) => { s.active = { id: payload, messages: [], status: 'loading', error: null }; s.sendError = null; },
    newConversation: (s) => { s.active = { id: null, messages: [], status: 'idle', error: null }; s.sendError = null; },
    clearSendError: (s) => { s.sendError = null; },
  },
  extraReducers: (b) => {
    b.addCase(fetchAiStatus.fulfilled, (s, { payload }) => { s.mode = payload; })
      .addCase(fetchConversations.pending, (s) => { s.conversations.status = 'loading'; })
      .addCase(fetchConversations.fulfilled, (s, { payload }) => { s.conversations = { items: payload, status: 'ready' }; })
      .addCase(fetchConversations.rejected, (s) => { s.conversations.status = 'failed'; })
      .addCase(fetchMessages.fulfilled, (s, { payload }) => { if (s.active.id === payload.id) { s.active.messages = payload.messages; s.active.status = 'ready'; } })
      .addCase(fetchMessages.rejected, (s, { payload, meta }) => { if (s.active.id === meta.arg) { s.active.status = 'failed'; s.active.error = payload?.message; } })
      .addCase(sendMessage.pending, (s, { meta }) => {
        s.sending = true; s.sendError = null;
        s.active.messages.push({ _id: `pending-${meta.requestId}`, role: 'user', content: meta.arg.message, pending: true }); // shown immediately
      })
      .addCase(sendMessage.fulfilled, (s, { payload, meta }) => {
        s.sending = false;
        s.active.messages = s.active.messages.filter((m) => m._id !== `pending-${meta.requestId}`);
        s.active.messages.push(payload.userMessage, payload.assistantMessage);
        s.active.id = payload.conversation._id;
        s.active.status = 'ready';
        s.mode = { mode: payload.mode, label: payload.label, model: payload.model };
        const rest = s.conversations.items.filter((c) => c._id !== payload.conversation._id);
        s.conversations.items = [payload.conversation, ...rest];
      })
      .addCase(sendMessage.rejected, (s, { payload, meta }) => {
        s.sending = false;
        s.active.messages = s.active.messages.filter((m) => m._id !== `pending-${meta.requestId}`);
        s.sendError = { message: payload?.message || 'Something went wrong', text: meta.arg.message };
      });
    // Never keep one visitor's conversations in memory after logout or session expiry.
    b.addMatcher((a) => a.type === 'auth/logout/fulfilled' || a.type === 'auth/clearUser', () => initialState);
  },
});

export const { selectConversation, newConversation, clearSendError } = slice.actions;
export default slice.reducer;
