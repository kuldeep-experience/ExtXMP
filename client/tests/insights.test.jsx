import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../src/features/auth/authSlice.js';
import insightsReducer from '../src/features/insights/insightsSlice.js';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import InsightsPanel from '../src/features/insights/InsightsPanel.jsx';
import { api } from '../src/lib/api.js';

vi.mock('../src/lib/api.js', () => ({ api: { get: vi.fn(), post: vi.fn() }, errorMessage: (e) => e.message }));

const item = (over) => ({ label: 'Responsive communication', detail: null, count: 5, commonality: 'common', sourceReviewIds: ['r1', 'r2'], quote: { reviewId: 'r1', text: 'Responded to every message' }, ...over });
const insight = (over = {}) => ({
  success: true, status: 'ready', aiGenerated: true, mode: 'demo', label: 'Demo analyzer', model: null, note: null, regenerating: false, minReviews: 5,
  freshness: { newReviews: 0, removedSources: 0, needsRegeneration: false, minNewReviews: 5 },
  data: {
    professional: 'p1', reviewsAnalyzed: 8, updatedAt: '2026-11-01T00:00:00Z', generatedAt: '2026-11-01T00:00:00Z',
    summary: { text: 'Based on 8 approved reviews, the average rating is 4.3 out of 5.' },
    positiveFeedback: [item()], strengths: [], concerns: [item({ label: 'Delays', commonality: 'isolated', count: 1, sourceReviewIds: ['r3'], quote: null })],
    recentTrends: [], services: [], experienceThemes: [],
  },
  ...over,
});
const renderPanel = (props = {}, authed = false) => {
  const store = configureStore({ reducer: { auth: authReducer, insights: insightsReducer }, preloadedState: { auth: { user: authed ? { firstName: 'A' } : null, status: authed ? 'authenticated' : 'unauthenticated', loading: false, error: null } } });
  return render(<Provider store={store}><MemoryRouter><ToastProvider><InsightsPanel professionalId="p1" pollMs={5} {...props} /></ToastProvider></MemoryRouter></Provider>);
};
beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

test('shows the summary, review count, date and a clear demo label', async () => {
  api.get.mockResolvedValue({ data: insight() });
  renderPanel();
  expect(await screen.findByText(/Based on 8 approved reviews/)).toBeInTheDocument();
  expect(screen.getByText('Demo analyzer')).toBeInTheDocument();
  expect(screen.getByText(/No AI model was used/)).toBeInTheDocument();
  expect(screen.getByText(/opinions, not verified facts/)).toBeInTheDocument();
  expect(screen.getByText(/Based on 8 reviews/)).toBeInTheDocument();
  expect(screen.getByText(/Last updated/)).toBeInTheDocument();
});

test('labels live output as AI-generated', async () => {
  api.get.mockResolvedValue({ data: insight({ mode: 'live', label: 'AI provider: Fake', model: 'fake-1' }) });
  renderPanel();
  expect(await screen.findByText('AI-generated')).toBeInTheDocument();
  expect(screen.getByText(/It can contain mistakes/)).toBeInTheDocument();
});

test('distinguishes common themes from single-review comments', async () => {
  api.get.mockResolvedValue({ data: insight() });
  renderPanel();
  expect(await screen.findByText('Common theme')).toBeInTheDocument();
  expect(screen.getByText('Single review')).toBeInTheDocument();
  expect(screen.getByText('5 of 8 reviews')).toBeInTheDocument();
});

test('sections expand and collapse', async () => {
  api.get.mockResolvedValue({ data: insight() });
  renderPanel();
  const trends = await screen.findByRole('button', { name: /Recent review trends/ });
  expect(trends).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(trends);
  expect(trends).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/Nothing in the reviews points to this/)).toBeInTheDocument();
});

test('supporting reviews are fetched from the sources endpoint when opened', async () => {
  api.get.mockImplementation((url) => (url.endsWith('/sources')
    ? Promise.resolve({ data: { data: [{ _id: 'r1', rating: 5, title: 'Great communication', text: 'Responded to every message quickly.', reviewDate: '2026-10-01T00:00:00Z', reviewerName: 'Pat A.', serviceCategory: 'Tax Planning' }, { _id: 'r2', rating: 5, title: 'Responsive', text: 'Very responsive.', reviewDate: '2026-09-01T00:00:00Z', reviewerName: 'Sam B.' }] } })
    : Promise.resolve({ data: insight() })));
  renderPanel();
  await userEvent.click(await screen.findByRole('button', { name: 'View 2 supporting reviews' }));
  expect(await screen.findByText('Responded to every message quickly.')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/review-insights/professional/p1/sources', { params: { ids: 'r1,r2', limit: 50 } });
  expect(screen.getByRole('link', { name: 'See all reviews' })).toHaveAttribute('href', '#reviews');
});

test('polls while generating, then shows the insights', async () => {
  api.get.mockResolvedValueOnce({ data: { success: true, status: 'generating', data: null, minReviews: 5 } }).mockResolvedValue({ data: insight() });
  renderPanel();
  expect(await screen.findByText('Analyzing reviews…')).toBeInTheDocument();
  expect(await screen.findByText(/Based on 8 approved reviews/)).toBeInTheDocument();
});

test('handles too few reviews and errors', async () => {
  api.get.mockResolvedValue({ data: { success: true, status: 'insufficient', reviewsAvailable: 3, minReviews: 5, data: null } });
  const { unmount } = renderPanel();
  expect(await screen.findByText(/3 of 5 needed/)).toBeInTheDocument();
  unmount();
  api.get.mockRejectedValue(new Error('Network down'));
  renderPanel();
  expect(await screen.findByText(/Could not load review insights: Network down/)).toBeInTheDocument();
});

test('only a signed-in visitor can update stale insights, and only when enough new reviews exist', async () => {
  const stale = insight({ freshness: { newReviews: 6, removedSources: 0, needsRegeneration: true, minNewReviews: 5 } });
  api.get.mockResolvedValue({ data: stale });
  const { unmount } = renderPanel({}, false);
  await screen.findByText(/6 new reviews since/);
  expect(screen.queryByRole('button', { name: /Update insights/ })).not.toBeInTheDocument();
  unmount();

  api.post.mockResolvedValue({ data: { ...insight(), generated: true, message: 'Insights updated.' } });
  renderPanel({}, true);
  await userEvent.click(await screen.findByRole('button', { name: /Update insights/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/review-insights/professional/p1/generate'));
  expect(await screen.findByText('Insights updated.')).toBeInTheDocument();

  api.get.mockResolvedValue({ data: insight({ freshness: { newReviews: 2, removedSources: 0, needsRegeneration: false, minNewReviews: 5 } }) });
});
