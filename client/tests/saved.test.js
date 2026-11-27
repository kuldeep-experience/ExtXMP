import { configureStore } from '@reduxjs/toolkit';
import reducer, { fetchSavedIds, removeSaved, saveProfessional } from '../src/features/saved/savedSlice.js';

const make = () => configureStore({ reducer: { saved: reducer } });
const act = (type, payload) => ({ type, payload });

test('bookmark map follows save and remove', () => {
  const store = make();
  store.dispatch(saveProfessional.fulfilled({ _id: 's1', professional: { _id: 'p1' } }, 'r1', {}));
  expect(store.getState().saved.ids.map).toEqual({ p1: 's1' });
  store.dispatch(removeSaved.fulfilled({ id: 's1', professionalId: 'p1' }, 'r2', {}));
  expect(store.getState().saved.ids.map).toEqual({});
});

test('ids load marks state ready', () => {
  const store = make();
  store.dispatch(fetchSavedIds.fulfilled({ p9: 's9' }, 'r', undefined));
  expect(store.getState().saved.ids).toEqual({ map: { p9: 's9' }, status: 'ready' });
});

test('saved data is wiped on logout and on session expiry', () => {
  for (const type of ['auth/logout/fulfilled', 'auth/clearUser']) {
    const store = make();
    store.dispatch(saveProfessional.fulfilled({ _id: 's1', professional: { _id: 'p1' } }, 'r', {}));
    store.dispatch(act(type));
    expect(store.getState().saved.ids.map).toEqual({});
    expect(store.getState().saved.ids.status).toBe('idle');
  }
});
