import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { searchChips, searchUrl, trackingOn, FILTER_KEYS } from '../src/lib/history.js';
import ProfessionalMiniCard from '../src/features/history/ProfessionalMiniCard.jsx';

test('tracking is on for signed-in visitors unless they turned it off', () => {
  expect(trackingOn(null)).toBe(false);
  expect(trackingOn({ privacySettings: { trackHistory: true } })).toBe(true);
  expect(trackingOn({})).toBe(true);
  expect(trackingOn({ privacySettings: { trackHistory: false } })).toBe(false);
});

test('a stored search becomes the same directory URL, so it can be repeated exactly', () => {
  const s = { query: 'mitchell', filters: { category: 'real-estate-agents', minRating: '4', sort: 'reviews' } };
  const url = searchUrl(s);
  expect(url.startsWith('/professionals?')).toBe(true);
  expect(Object.fromEntries(new URL(url, 'http://x').searchParams)).toEqual({ q: 'mitchell', category: 'real-estate-agents', minRating: '4', sort: 'reviews' });
  expect(searchUrl({ query: '', filters: { location: 'Austin' } })).toBe('/professionals?location=Austin');
});

test('search summary lists the criteria in plain words', () => {
  expect(searchChips({ query: 'ann', filters: { category: 'legal-professionals', location: 'TX', minRating: '4', specialization: 'Family Law,Estate Planning', verified: 'true', sort: 'experience' } }))
    .toEqual(['“ann”', 'Legal Professionals', 'TX', 'Rated 4+', 'Family Law', 'Estate Planning', 'Verified only', 'Sort: Most experienced']);
  expect(searchChips({ query: '', filters: { maxDistanceKm: '25', near: 'New York, NY', lat: '1', lng: '2' } })).toEqual(['Within 25 km of New York, NY']);
});

test('only directory search parameters are ever sent to history', () => {
  for (const k of ['category', 'location', 'specialization', 'services', 'minRating', 'minExperience', 'verified', 'lat', 'lng', 'maxDistanceKm', 'sort', 'near']) expect(FILTER_KEYS).toContain(k);
  expect(FILTER_KEYS).not.toContain('page');
  expect(FILTER_KEYS).not.toContain('savedSearch');
});

test('the reusable professional card shows rating, location and its footer', () => {
  const pro = { _id: 'p1', fullName: 'Sam Lee', title: 'Broker', category: 'Mortgage Professionals', location: 'Austin, TX', averageRating: 4.5, reviewCount: 12, verificationStatus: 'verified', profileImage: null };
  render(<MemoryRouter><ProfessionalMiniCard pro={pro}><p>Viewed 3 times</p></ProfessionalMiniCard></MemoryRouter>);
  expect(screen.getByRole('link', { name: /Sam Lee/ })).toHaveAttribute('href', '/professionals/p1');
  expect(screen.getByText('Austin, TX')).toBeInTheDocument();
  expect(screen.getByText('Viewed 3 times')).toBeInTheDocument();
  expect(screen.getByLabelText('Verified')).toBeInTheDocument();
});
