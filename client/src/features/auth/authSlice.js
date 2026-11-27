import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, errorDetails, errorMessage } from '../../lib/api.js';

// Every thunk rejects with { message, details } so forms can show field-level errors.
const thunk = (type, fn) =>
  createAsyncThunk(type, async (arg, { rejectWithValue }) => {
    try { return await fn(arg); } catch (e) { return rejectWithValue({ message: errorMessage(e), details: errorDetails(e) }); }
  });

export const fetchMe = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue }) => {
  try { return (await api.get('/auth/me')).data.data; } catch (e) {
    if (e.response?.status === 401) return null; // simply not logged in
    return rejectWithValue({ message: errorMessage(e) });
  }
});
export const register = thunk('auth/register', async (body) => (await api.post('/auth/register', body)).data.data);
export const login = thunk('auth/login', async (body) => (await api.post('/auth/login', body)).data.data);
export const logout = thunk('auth/logout', async () => { await api.post('/auth/logout'); return null; });
export const forgotPassword = thunk('auth/forgotPassword', async (body) => (await api.post('/auth/forgot-password', body)).data.message);
export const resetPassword = thunk('auth/resetPassword', async (body) => (await api.post('/auth/reset-password', body)).data.message);
export const verifyEmail = thunk('auth/verifyEmail', async (body) => (await api.post('/auth/verify-email', body)).data.message);
export const resendVerification = thunk('auth/resendVerification', async () => (await api.post('/auth/resend-verification')).data.message);
export const updateProfile = thunk('auth/updateProfile', async (body) => (await api.patch('/auth/profile', body)).data.data);
export const changePassword = thunk('auth/changePassword', async (body) => (await api.patch('/auth/change-password', body)).data.data);

const setUser = (s, user) => { s.user = user; s.status = user ? 'authenticated' : 'unauthenticated'; };

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    status: 'unknown', // unknown (not checked yet) | authenticated | unauthenticated
    loading: false,
    error: null,
  },
  reducers: {
    clearUser: (s) => setUser(s, null),
    clearError: (s) => { s.error = null; },
  },
  extraReducers: (b) => {
    b.addCase(fetchMe.fulfilled, (s, { payload }) => setUser(s, payload))
      .addCase(fetchMe.rejected, (s) => { if (s.status === 'unknown') s.status = 'unauthenticated'; });
    [register, login, updateProfile, changePassword].forEach((t) => b.addCase(t.fulfilled, (s, { payload }) => setUser(s, payload)));
    b.addCase(logout.fulfilled, (s) => setUser(s, null));
    b.addMatcher((a) => a.type.startsWith('auth/') && a.type.endsWith('/pending'), (s) => { s.loading = true; s.error = null; })
      .addMatcher((a) => a.type.startsWith('auth/') && a.type.endsWith('/fulfilled'), (s) => { s.loading = false; })
      .addMatcher((a) => a.type.startsWith('auth/') && a.type.endsWith('/rejected'), (s, a) => { s.loading = false; s.error = a.payload?.message || a.error?.message || 'Request failed'; });
  },
});

export const { clearUser, clearError } = authSlice.actions;
export const selectUser = (s) => s.auth.user;
export const selectIsAuthenticated = (s) => s.auth.status === 'authenticated';
export default authSlice.reducer;
