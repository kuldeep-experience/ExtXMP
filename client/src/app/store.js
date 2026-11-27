import { configureStore } from '@reduxjs/toolkit';
import authReducer, { clearUser } from '../features/auth/authSlice.js';
import savedReducer from '../features/saved/savedSlice.js';
import searchesReducer from '../features/searches/searchesSlice.js';
import aiReducer from '../features/ai/aiSlice.js';
import experienceReducer from '../features/experience/experienceSlice.js';
import conversationsReducer from '../features/conversations/conversationsSlice.js';
import serviceRecordsReducer from '../features/serviceRecords/serviceRecordsSlice.js';
import insightsReducer from '../features/insights/insightsSlice.js';
import historyReducer from '../features/history/historySlice.js';
import professionalsReducer from '../features/professionals/professionalsSlice.js';
import { setUnauthorizedHandler } from '../lib/api.js';

export const store = configureStore({ reducer: { auth: authReducer, professionals: professionalsReducer, saved: savedReducer, searches: searchesReducer, ai: aiReducer,
    experience: experienceReducer, conversations: conversationsReducer, insights: insightsReducer, history: historyReducer, serviceRecords: serviceRecordsReducer } });

// A 401 from the API means the session ended: drop local auth state so route guards redirect to login.
setUnauthorizedHandler(() => { if (store.getState().auth.user) store.dispatch(clearUser()); });
