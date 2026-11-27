import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer, { selectIsAuthenticated } from '../src/features/auth/authSlice.js';
import { GuestRoute, ProtectedRoute } from '../src/components/routes/Guards.jsx';

const setup = (auth, path) => {
  const store = configureStore({ reducer: { auth: authReducer }, preloadedState: { auth: { user: null, loading: false, error: null, ...auth } } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ProtectedRoute />}><Route path="/dashboard" element={<p>private page</p>} /></Route>
          <Route element={<GuestRoute />}><Route path="/login" element={<p>login page</p>} /></Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
};

test('anonymous visitor is redirected from a private route to login', () => {
  setup({ status: 'unauthenticated' }, '/dashboard');
  expect(screen.queryByText('private page')).not.toBeInTheDocument();
  expect(screen.getByText('login page')).toBeInTheDocument();
});

test('authenticated visitor can open private routes', () => {
  setup({ status: 'authenticated', user: { firstName: 'A' } }, '/dashboard');
  expect(screen.getByText('private page')).toBeInTheDocument();
});

test('authenticated visitor is bounced away from guest pages', () => {
  setup({ status: 'authenticated', user: { firstName: 'A' } }, '/login');
  expect(screen.queryByText('login page')).not.toBeInTheDocument();
  expect(screen.getByText('private page')).toBeInTheDocument();
});

test('nothing renders before the session check finishes', () => {
  setup({ status: 'unknown' }, '/dashboard');
  expect(screen.queryByText('private page')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toBeInTheDocument();
});

test('selectIsAuthenticated', () => {
  expect(selectIsAuthenticated({ auth: { status: 'authenticated' } })).toBe(true);
  expect(selectIsAuthenticated({ auth: { status: 'unknown' } })).toBe(false);
});
