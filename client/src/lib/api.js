import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

// ---- CSRF: token comes from GET /auth/csrf and is echoed on every state-changing request ----
let csrfToken = null;
let pending = null;
const ensureCsrf = () => {
  if (csrfToken) return Promise.resolve(csrfToken);
  pending ||= api.get('/auth/csrf').then((r) => (csrfToken = r.data.csrfToken)).finally(() => { pending = null; });
  return pending;
};
api.interceptors.request.use(async (config) => {
  if (!['get', 'head', 'options'].includes((config.method || 'get').toLowerCase())) {
    config.headers['x-csrf-token'] = await ensureCsrf();
  }
  return config;
});

// ---- 401 handling: the store registers a callback so this module never imports the store ----
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  (res) => {
    if (res.data?.csrfToken) csrfToken = res.data.csrfToken;
    return res;
  },
  async (error) => {
    const { response, config } = error;
    if (response?.status === 403 && response.data?.code === 'CSRF' && !config._csrfRetried) {
      csrfToken = null; // stale token (e.g. cookie expired or another tab): fetch a new one and retry once
      config._csrfRetried = true;
      return api(config);
    }
    if (response?.status === 401) onUnauthorized(config?.url);
    return Promise.reject(error);
  },
);

export const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong';
export const errorDetails = (err) => err?.response?.data?.details;
