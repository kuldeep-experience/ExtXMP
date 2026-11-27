import { configureStore } from '@reduxjs/toolkit';
import reducer, { newConversation, selectConversation, sendMessage } from '../src/features/ai/aiSlice.js';
import { criteriaChips } from '../src/features/ai/ChatMessage.jsx';

const make = () => configureStore({ reducer: { ai: reducer } });
const payload = (id = 'c1') => ({
  conversation: { _id: id, title: 'T', messageCount: 2, lastMessageAt: 'x' }, mode: 'demo', label: 'Demo mode', model: null,
  userMessage: { _id: 'u1', role: 'user', content: 'hi' }, assistantMessage: { _id: 'a1', role: 'assistant', content: 'yo', search: { recommendations: [], criteria: {} } },
});

test('a sent message shows immediately, then is replaced by the stored messages', () => {
  const store = make();
  const arg = { message: 'hi' };
  store.dispatch(sendMessage.pending('r1', arg, undefined));
  let s = store.getState().ai;
  expect(s.sending).toBe(true);
  expect(s.active.messages).toHaveLength(1);
  expect(s.active.messages[0].pending).toBe(true);
  store.dispatch(sendMessage.fulfilled(payload(), 'r1', arg));
  s = store.getState().ai;
  expect(s.sending).toBe(false);
  expect(s.active.messages.map((m) => m._id)).toEqual(['u1', 'a1']);
  expect(s.active.id).toBe('c1');
  expect(s.mode.mode).toBe('demo');
  expect(s.conversations.items[0]._id).toBe('c1');
});

test('a failed send removes the pending message and keeps the text for retry', () => {
  const store = make();
  const arg = { message: 'hello there' };
  store.dispatch(sendMessage.pending('r2', arg, undefined));
  store.dispatch(sendMessage.rejected(null, 'r2', arg, { message: 'Too many requests' }));
  const s = store.getState().ai;
  expect(s.active.messages).toHaveLength(0);
  expect(s.sendError).toEqual({ message: 'Too many requests', text: 'hello there' });
});

test('conversation selection, new conversation and logout reset', () => {
  const store = make();
  store.dispatch(selectConversation('c9'));
  expect(store.getState().ai.active).toMatchObject({ id: 'c9', status: 'loading', messages: [] });
  store.dispatch(newConversation());
  expect(store.getState().ai.active.id).toBeNull();
  store.dispatch(sendMessage.fulfilled(payload(), 'r3', { message: 'hi' }));
  store.dispatch({ type: 'auth/logout/fulfilled' });
  expect(store.getState().ai.conversations.items).toEqual([]);
  expect(store.getState().ai.active.messages).toEqual([]);
});

test('"what I understood" chips reflect the extracted criteria', () => {
  expect(criteriaChips({ category: 'real-estate-agents', location: 'Austin', minExperience: 5, minRating: 4.5, specializations: ['First-Time Buyers'], services: [], topics: ['commercial property'], verifiedOnly: true }))
    .toEqual(['Real Estate Agents', 'Austin', '5+ years', 'Rated 4.5+', 'First-Time Buyers', '“commercial property”', 'Verified only']);
  expect(criteriaChips({ nearMe: true, specializations: [], services: [], topics: [] })).toEqual(['Near me']);
});
