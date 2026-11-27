import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { CheckCircle2, XCircle } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, Loader } from '../components/ui/index.js';
import { fetchMe, verifyEmail } from '../features/auth/authSlice.js';

export default function VerifyEmail() {
  const token = useSearchParams()[0].get('token') || '';
  const dispatch = useDispatch();
  const [state, setState] = useState({ status: 'loading', message: '' });
  const ran = useRef(false); // the token is single-use; do not submit twice under StrictMode

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) return setState({ status: 'failed', message: 'This verification link is missing its token.' });
    dispatch(verifyEmail({ token })).then((res) => {
      if (verifyEmail.fulfilled.match(res)) { dispatch(fetchMe()); setState({ status: 'ok', message: res.payload }); }
      else setState({ status: 'failed', message: res.payload?.message });
    });
  }, [dispatch, token]);

  return (
    <AuthLayout title="Email verification" subtitle="">
      {state.status === 'loading' && <Loader label="Verifying…" />}
      {state.status === 'ok' && <div className="text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><p className="mt-3 text-sm">Your email address is verified.</p><Link to="/dashboard" className="mt-4 inline-block"><Button>Go to dashboard</Button></Link></div>}
      {state.status === 'failed' && <div className="text-center"><XCircle className="mx-auto h-10 w-10 text-red-500" /><p className="mt-3 text-sm text-slate-700">{state.message}</p><p className="mt-2 text-xs text-slate-500">Log in and use “Resend verification email” in Settings to get a new link.</p></div>}
    </AuthLayout>
  );
}
