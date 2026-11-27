import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Mail, Lock, User, Phone } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, Input } from '../components/ui/index.js';
import { useForm } from '../lib/useForm.js';
import { clearError, register } from '../features/auth/authSlice.js';
import { useToast } from '../context/ToastContext.jsx';

export default function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const { loading, error } = useSelector((s) => s.auth);
  const [values, field] = useForm({ firstName: '', lastName: '', email: '', phone: '', password: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    dispatch(clearError());
    if (values.password !== values.confirm) return setFieldErrors({ confirm: ['Passwords do not match'] });
    setFieldErrors({});
    const { confirm, ...body } = values;
    if (!body.phone) delete body.phone;
    const res = await dispatch(register(body));
    if (register.fulfilled.match(res)) {
      toast.success('Account created. Please verify your email address.');
      navigate('/dashboard', { replace: true });
    } else setFieldErrors(res.payload?.details || {});
  };
  const err = (k) => fieldErrors[k]?.[0];

  return (
    <AuthLayout title="Create your account" subtitle="Find and book trusted professionals."
      footer={<>Already registered? <Link to="/login" className="text-brand-600 hover:underline">Log in</Link></>}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {error && !Object.keys(fieldErrors).length && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" icon={User} autoComplete="given-name" required error={err('firstName')} {...field('firstName')} />
          <Input label="Last name" autoComplete="family-name" required error={err('lastName')} {...field('lastName')} />
        </div>
        <Input label="Email" type="email" icon={Mail} autoComplete="email" required placeholder="you@example.com" error={err('email')} {...field('email')} />
        <Input label="Phone (optional)" type="tel" icon={Phone} autoComplete="tel" error={err('phone')} {...field('phone')} />
        <Input label="Password" type="password" icon={Lock} autoComplete="new-password" required placeholder="8+ characters, a letter and a number" error={err('password')} {...field('password')} />
        <Input label="Confirm password" type="password" icon={Lock} autoComplete="new-password" required error={err('confirm')} {...field('confirm')} />
        <Button type="submit" className="w-full" loading={loading}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
