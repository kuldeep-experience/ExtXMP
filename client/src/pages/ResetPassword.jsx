import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Lock } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, Input } from '../components/ui/index.js';
import { useForm } from '../lib/useForm.js';
import { clearError, resetPassword } from '../features/auth/authSlice.js';
import { useToast } from '../context/ToastContext.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const { loading, error } = useSelector((s) => s.auth);
  const [values, field] = useForm({ password: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    dispatch(clearError());
    if (values.password !== values.confirm) return setFieldErrors({ confirm: ['Passwords do not match'] });
    setFieldErrors({});
    const res = await dispatch(resetPassword({ token, password: values.password }));
    if (resetPassword.fulfilled.match(res)) { toast.success(res.payload); navigate('/login', { replace: true }); }
    else setFieldErrors(res.payload?.details || {});
  };

  return (
    <AuthLayout title="Choose a new password" subtitle="Your reset link works once and expires after an hour."
      footer={<Link to="/forgot-password" className="text-brand-600 hover:underline">Request a new link</Link>}>
      {!token ? (
        <p className="text-sm text-red-700">This reset link is missing its token. Please request a new one.</p>
      ) : (
        <form className="space-y-4" onSubmit={submit} noValidate>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Input label="New password" type="password" icon={Lock} autoComplete="new-password" required placeholder="8+ characters, a letter and a number" error={fieldErrors.password?.[0]} {...field('password')} />
          <Input label="Confirm new password" type="password" icon={Lock} autoComplete="new-password" required error={fieldErrors.confirm?.[0]} {...field('confirm')} />
          <Button type="submit" className="w-full" loading={loading}>Update password</Button>
        </form>
      )}
    </AuthLayout>
  );
}
