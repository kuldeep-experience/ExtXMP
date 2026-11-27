import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import './index.css';
import { store } from './app/store.js';
import { fetchMe } from './features/auth/authSlice.js';
import { router } from './app/router.jsx';
import { ToastProvider } from './context/ToastContext.jsx';

store.dispatch(fetchMe()); // restore the session from the HttpOnly cookie

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  </StrictMode>,
);
