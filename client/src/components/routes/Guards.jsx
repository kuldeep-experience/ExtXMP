import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Loader } from '../ui/index.js';

export function ProtectedRoute() {
  const status = useSelector((s) => s.auth.status);
  const location = useLocation();
  if (status === 'unknown') return <Loader label="Checking your session…" fullPage />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

// Login/register pages are for signed-out visitors only.
export function GuestRoute() {
  const status = useSelector((s) => s.auth.status);
  if (status === 'unknown') return <Loader fullPage />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
