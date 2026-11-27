import { configureStore } from '@reduxjs/toolkit';
import reducer from '../src/features/professionals/professionalsSlice.js';

test('professionals reducer builds and has the expected initial state', () => {
  const store = configureStore({ reducer: { professionals: reducer } });
  const s = store.getState().professionals;
  expect(Object.keys(s)).toEqual(['list', 'featured', 'categories', 'detail', 'reviews']);
  expect(s.detail.item).toBeNull();
});
