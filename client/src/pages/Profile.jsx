import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Badge, Avatar, Button, Card, Input } from '../components/ui/index.js';
import { useForm } from '../lib/useForm.js';
import { updateProfile } from '../features/auth/authSlice.js';
import { useToast } from '../context/ToastContext.jsx';

export default function Profile() {
  const user = useSelector((s) => s.auth.user);
  const loading = useSelector((s) => s.auth.loading);
  const dispatch = useDispatch();
  const toast = useToast();
  const [values, field] = useForm({ firstName: user.firstName, lastName: user.lastName, phone: user.phone || '', profileImage: user.profileImage || '' });
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const res = await dispatch(updateProfile(values));
    if (updateProfile.fulfilled.match(res)) { setErrors({}); toast.success('Profile updated'); }
    else { setErrors(res.payload?.details || {}); toast.error(res.payload?.message); }
  };
  const err = (k) => errors[k]?.[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">My profile</h1>
      <Card>
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={`${values.firstName} ${values.lastName}`} src={values.profileImage} size="h-20 w-20 text-2xl" />
          <div>
            <p className="text-lg font-semibold">{user.firstName} {user.lastName}</p>
            <div className="mt-1 flex gap-2"><Badge tone="blue">Visitor</Badge>{user.emailVerified ? <Badge tone="green">Email verified</Badge> : <Badge tone="amber">Email not verified</Badge>}</div>
          </div>
        </div>
        <form className="space-y-4" onSubmit={submit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="First name" required error={err('firstName')} {...field('firstName')} />
            <Input label="Last name" required error={err('lastName')} {...field('lastName')} />
          </div>
          <Input label="Email" value={user.email} disabled readOnly />
          <Input label="Phone" type="tel" error={err('phone')} {...field('phone')} />
          <Input label="Profile image URL" placeholder="https://…" error={err('profileImage')} {...field('profileImage')} />
          <Button type="submit" loading={loading}>Save changes</Button>
        </form>
      </Card>
    </div>
  );
}
