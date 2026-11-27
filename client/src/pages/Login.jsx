import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Mail, Lock } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, Input } from '../components/ui/index.js';
import { useForm } from '../lib/useForm.js';
import { clearError, login } from '../features/auth/authSlice.js';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, error } = useSelector((s) => s.auth);
  const [values, field] = useForm({ email: '', password: '' });

  const submit = async (e) => {
    e.preventDefault();
    dispatch(clearError());
    const res = await dispatch(login(values));
    if (login.fulfilled.match(res)) navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to your visitor account."
      footer={<>New here? <Link to="/register" className="text-brand-600 hover:underline">Create an account</Link></>}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Input label="Email" type="email" icon={Mail} autoComplete="email" required placeholder="you@example.com" {...field('email')} />
        <Input label="Password" type="password" icon={Lock} autoComplete="current-password" required placeholder="••••••••" {...field('password')} />
        <div className="text-right"><Link to="/forgot-password" className="text-sm text-brand-600 hover:underline">Forgot password?</Link></div>
        <Button type="submit" className="w-full" loading={loading}>Log in</Button>
      </form>
    </AuthLayout>
  );
}
