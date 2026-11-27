import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import experienceReducer from '../src/features/experience/experienceSlice.js';
import historyReducer, { clearHistory, removeHistoryItem } from '../src/features/history/historySlice.js';
import insightsReducer, { fetchInsight } from '../src/features/insights/insightsSlice.js';
import conversationsReducer, { fetchConversationList, selectConversations } from '../src/features/conversations/conversationsSlice.js';
import ExperienceModal from '../src/features/experience/ExperienceModal.jsx';
import { ConfirmDialog, Skeleton } from '../src/components/ui/index.js';
import { api } from '../src/lib/api.js';
import { greeting, toLocalInput } from '../src/lib/format.js';

vi.mock('../src/lib/api.js', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, errorMessage: (e) => e.message, errorDetails: (e) => e.details }));

const store = () => configureStore({ reducer: { experience: experienceReducer, history: historyReducer, insights: insightsReducer, conversations: conversationsReducer } });
const wrap = (ui, s = store()) => render(<Provider store={s}><MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter></Provider>);
const pro = { _id: 'p1', fullName: 'Sam Lee', title: 'Broker', location: 'Austin, TX', profileImage: null, services: ['Refinancing', 'Rate Comparison'] };
beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

// ---------- slices ----------
test('conversation lists are kept under their own key, so pages do not overwrite each other', async () => {
  const s = store();
  api.get.mockResolvedValueOnce({ data: { data: [{ _id: 'a1' }], pagination: { total: 1 } } }).mockResolvedValueOnce({ data: { data: [{ _id: 'a2' }, { _id: 'a3' }], pagination: { total: 2 } } });
  await s.dispatch(fetchConversationList({ key: 'overview', limit: 3 }));
  await s.dispatch(fetchConversationList({ key: 'main' }));
  expect(selectConversations('overview')(s.getState()).items.map((a) => a._id)).toEqual(['a1']);
  expect(selectConversations('main')(s.getState()).items.map((a) => a._id)).toEqual(['a2', 'a3']);
  expect(api.get).toHaveBeenCalledWith('/ai/conversations', { params: { limit: 3 } }); // the key is not sent to the API
  expect(selectConversations('never-loaded')(s.getState()).status).toBe('idle');
});

test('a failed list load keeps the error message; logout clears every slice', async () => {
  const s = store();
  api.get.mockRejectedValue(Object.assign(new Error('Server down'), { details: undefined }));
  await s.dispatch(fetchConversationList({ key: 'upcoming' }));
  expect(selectConversations('upcoming')(s.getState())).toMatchObject({ status: 'failed', error: 'Server down' });
  api.get.mockResolvedValue({ data: { data: [{ _id: 'c1' }], pagination: { total: 1 } } });
  await s.dispatch(fetchConversationList({ key: 'main' }));
  expect(s.getState().conversations.lists.main.items).toHaveLength(1);
  s.dispatch({ type: 'auth/logout/fulfilled' });
  for (const k of ['conversations', 'insights', 'history']) expect(JSON.stringify(s.getState()[k])).not.toContain('c1');
  expect(s.getState().conversations.lists).toEqual({});
});

test('history slice removes one item or clears sections', async () => {
  const s = store();
  api.get.mockResolvedValue({ data: { data: [{ _id: 'v1' }, { _id: 'v2' }], pagination: { total: 2 } } });
  const { fetchViewed } = await import('../src/features/history/historySlice.js');
  await s.dispatch(fetchViewed({ limit: 5 }));
  api.delete.mockResolvedValue({ data: {} });
  await s.dispatch(removeHistoryItem({ kind: 'viewed', id: 'v1' }));
  expect(s.getState().history.viewed.items.map((i) => i._id)).toEqual(['v2']);
  api.delete.mockResolvedValue({ data: { deleted: 4 } });
  const res = await s.dispatch(clearHistory(['viewed', 'searches']));
  expect(res.payload.deleted).toBe(8);
  expect(api.delete).toHaveBeenCalledWith('/recently-viewed/clear');
  expect(api.delete).toHaveBeenCalledWith('/search-history/clear');
  expect(s.getState().history.viewed.items).toEqual([]);
});

test('insights are cached per professional', async () => {
  const s = store();
  api.get.mockResolvedValue({ data: { status: 'ready', data: { reviewsAnalyzed: 8 } } });
  await s.dispatch(fetchInsight('p1'));
  expect(s.getState().insights.byProfessional.p1).toMatchObject({ status: 'ready', body: { data: { reviewsAnalyzed: 8 } } });
  expect(s.getState().insights.byProfessional.p2).toBeUndefined();
});

// ---------- shared UI ----------
test('confirm dialog only appears when open and reports the choice', async () => {
  const onConfirm = vi.fn(), onClose = vi.fn();
  const { rerender } = render(<ConfirmDialog open={false} title="Delete?" message="Sure?" onConfirm={onConfirm} onClose={onClose} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  rerender(<ConfirmDialog open title="Delete?" message="Sure?" confirmLabel="Remove it" onConfirm={onConfirm} onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: 'Delete?' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove it' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalled();
});

test('skeletons are hidden from assistive technology', () => {
  const { container } = render(<Skeleton className="h-4 w-10" />);
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
});

test('formatting helpers', () => {
  expect(greeting(new Date(2026, 0, 1, 8))).toBe('Good morning');
  expect(greeting(new Date(2026, 0, 1, 14))).toBe('Good afternoon');
  expect(greeting(new Date(2026, 0, 1, 20))).toBe('Good evening');
  expect(toLocalInput(new Date(2026, 5, 15, 9, 30))).toBe('2026-06-15T09:30'); // local wall-clock time, as datetime-local expects
});

// ---------- forms ----------
test('experience form: required fields and a future date are rejected before the API call', async () => {
  api.post.mockResolvedValue({ data: { data: { _id: 'e1' } } });
  wrap(<ExperienceModal open preset={{ professional: pro }} onClose={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Save experience' }));
  expect(await screen.findByText('Tell us which service you used')).toBeInTheDocument();
  expect(screen.getByText('Choose a date')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();

  await userEvent.type(screen.getByLabelText(/Service used/), 'Refinancing');
  fireEvent.change(screen.getByLabelText(/Date/), { target: { value: '2099-01-01' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save experience' }));
  expect(await screen.findByText('The date cannot be in the future')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/Date/), { target: { value: '2024-05-01' } });
  await userEvent.selectOptions(screen.getByLabelText(/Your rating/), '4');
  await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save experience' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(api.post.mock.calls[0][1]).toMatchObject({ professionalId: 'p1', serviceUsed: 'Refinancing', rating: 4, wouldRecommend: 'yes', notes: '' });
});
