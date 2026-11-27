import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Card, DevMailboxHint, Input, Modal, Select } from '../components/ui/index.js';
import { api, errorMessage } from '../lib/api.js';
import { useForm } from '../lib/useForm.js';
import { changePassword, resendVerification, updateProfile } from '../features/auth/authSlice.js';
import { useToast } from '../context/ToastContext.jsx';

const prefs = [
  ['recommendations', 'Recommendations', 'Suggestions based on your searches and saved professionals.'],
  ['productUpdates', 'Product updates', 'News about new Experience.com features.'],
];

export default function Settings() {
  const user = useSelector((s) => s.auth.user);
  const loading = useSelector((s) => s.auth.loading);
  const dispatch = useDispatch();
  const toast = useToast();
  const [pw, pwField, setPw] = useForm({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [confirmClear, setConfirmClear] = useState(false);
  const privacy = user.privacySettings ?? { trackHistory: true, historyRetentionDays: 90 };

  const savePrivacy = async (change) => {
    const res = await dispatch(updateProfile({ privacySettings: change }));
    res.error ? toast.error(res.payload?.message) : toast.success('Privacy settings saved');
  };
  const clearAll = async () => {
    setConfirmClear(false);
    try {
      const results = await Promise.all(['/recently-viewed/clear', '/search-history/clear', '/recent-comparisons/clear'].map((u) => api.delete(u)));
      toast.success(`History deleted (${results.reduce((n, r) => n + r.data.deleted, 0)} records).`);
    } catch (e) { toast.error(errorMessage(e)); }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return setPwErrors({ confirm: ['Passwords do not match'] });
    const res = await dispatch(changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }));
    if (changePassword.fulfilled.match(res)) { setPwErrors({}); setPw({ currentPassword: '', newPassword: '', confirm: '' }); toast.success('Password changed. Other devices were signed out.'); }
    else { setPwErrors(res.payload?.details || {}); toast.error(res.payload?.message); }
  };

  const togglePref = async (key, value) => {
    const res = await dispatch(updateProfile({ notificationPreferences: { [key]: value } }));
    if (updateProfile.rejected.match(res)) toast.error(res.payload?.message);
  };

  const resend = async () => {
    const res = await dispatch(resendVerification());
    resendVerification.fulfilled.match(res) ? toast.success(res.payload) : toast.error(res.payload?.message);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card title="Email verification">
        <p className="text-sm text-slate-600">{user.emailVerified ? `${user.email} is verified.` : `${user.email} is not verified yet.`}</p>
        {!user.emailVerified && <><Button className="mt-3" size="sm" variant="secondary" onClick={resend}>Resend verification email</Button><DevMailboxHint email={user.email} /></>}
      </Card>

      <Card title="Notification preferences">
        <ul className="divide-y divide-slate-100">
          {prefs.map(([key, label, desc]) => (
            <li key={key} className="flex items-center justify-between gap-4 py-3">
              <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-slate-500">{desc}</p></div>
              <input type="checkbox" role="switch" aria-label={label} className="h-5 w-5 rounded border-slate-300 text-brand-600"
                checked={user.notificationPreferences[key]} onChange={(e) => togglePref(key, e.target.checked)} />
            </li>
          ))}
        </ul>
      </Card>

      <div id="privacy">
        <Card title="Privacy & history">
          <p className="text-sm text-slate-600">While history is on, we save the professionals you open, the searches you run and the comparisons you make, only for your account. Only you can see them, and you can delete them at any time. They are removed automatically after the period you choose.</p>
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-100 py-3">
            <div><p className="text-sm font-medium">Keep my browsing history</p><p className="text-xs text-slate-500">Turn off to stop saving anything new. Existing history stays until you clear it.</p></div>
            <input type="checkbox" role="switch" aria-label="Keep my browsing history" className="h-5 w-5 rounded border-slate-300 text-brand-600" checked={privacy.trackHistory} onChange={(e) => savePrivacy({ trackHistory: e.target.checked })} />
          </div>
          <Select label="Delete history older than" className="max-w-xs" value={String(privacy.historyRetentionDays)} onChange={(e) => savePrivacy({ historyRetentionDays: Number(e.target.value) })}
            options={[30, 90, 180, 365].map((d) => ({ value: String(d), label: `${d} days` }))} />
          <Button className="mt-4" variant="secondary" onClick={() => setConfirmClear(true)}>Clear all history</Button>
        </Card>
        <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear all history?" footer={<><Button variant="secondary" onClick={() => setConfirmClear(false)}>Cancel</Button><Button variant="danger" onClick={clearAll}>Delete</Button></>}>
          <p className="text-sm text-slate-700">This permanently deletes the professionals you viewed, your searches and your comparisons. It cannot be undone.</p>
        </Modal>
      </div>

      <Card title="Change password">
        <form className="space-y-4" onSubmit={submitPassword} noValidate>
          <Input label="Current password" type="password" autoComplete="current-password" required error={pwErrors.currentPassword?.[0]} {...pwField('currentPassword')} />
          <Input label="New password" type="password" autoComplete="new-password" required placeholder="8+ characters, a letter and a number" error={pwErrors.newPassword?.[0]} {...pwField('newPassword')} />
          <Input label="Confirm new password" type="password" autoComplete="new-password" required error={pwErrors.confirm?.[0]} {...pwField('confirm')} />
          <Button type="submit" loading={loading}>Update password</Button>
        </form>
      </Card>
    </div>
  );
}
