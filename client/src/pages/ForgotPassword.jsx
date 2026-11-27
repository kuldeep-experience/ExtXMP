import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Mail, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, DevMailboxHint, Input } from '../components/ui/index.js';
import { useForm } from '../lib/useForm.js';
import { clearError, forgotPassword } from '../features/auth/authSlice.js';

export default function ForgotPassword() {
  const dispatch = useDispatch();
  const { loading, error } = useSelector((s) => s.auth);
  const [values, field] = useForm({ email: '' });
  const [sent, setSent] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    dispatch(clearError());
    const res = await dispatch(forgotPassword(values));
    if (forgotPassword.fulfilled.match(res)) setSent(res.payload);
  };

  return (
    <AuthLayout title="Forgot your password?" subtitle="Enter your email and we'll send a reset link."
      footer={<Link to="/login" className="text-brand-600 hover:underline">Back to log in</Link>}>
      {sent ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 text-sm text-slate-700">{sent}</p>
          <DevMailboxHint email={values.email} />
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit} noValidate>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Input label="Email" type="email" icon={Mail} required autoComplete="email" {...field('email')} />
          <Button type="submit" className="w-full" loading={loading}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
