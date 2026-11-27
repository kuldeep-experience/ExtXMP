import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Input, Modal, ProfessionalPicker, Select } from '../../components/ui/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { createExperience, updateExperience } from './experienceSlice.js';

const RATINGS = [{ value: '', label: 'No rating' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? '' : 's'}` }))];
const REC = [['yes', 'Yes'], ['unsure', 'Not sure'], ['no', 'No']];
const today = () => new Date().toISOString().slice(0, 10);
const blank = { professional: null, serviceUsed: '', experienceDate: '', rating: '', wouldRecommend: '', notes: '' };

// Log (create) or edit a private record of an experience. `preset` can pre-fill the form.
export default function ExperienceModal({ open, onClose, entry = null, preset = null, onSaved }) {
  const dispatch = useDispatch();
  const toast = useToast();
  const editing = !!entry;
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((v) => ({ ...v, ...patch }));

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (entry) setF({ professional: entry.professional, serviceUsed: entry.serviceUsed, experienceDate: entry.experienceDate.slice(0, 10), rating: entry.rating ? String(entry.rating) : '', wouldRecommend: entry.wouldRecommend || '', notes: entry.notes || '' });
    else setF({ ...blank, ...preset });
  }, [open, entry, preset]);

  const submit = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (!f.professional) e.professional = 'Choose a professional';
    if (!f.serviceUsed.trim()) e.serviceUsed = 'Tell us which service you used';
    if (!f.experienceDate) e.experienceDate = 'Choose a date';
    else if (f.experienceDate > today()) e.experienceDate = 'The date cannot be in the future';
    setErrors(e);
    if (Object.keys(e).length) return;
    const body = { serviceUsed: f.serviceUsed.trim(), experienceDate: new Date(f.experienceDate).toISOString(), rating: f.rating ? Number(f.rating) : null, wouldRecommend: f.wouldRecommend || null, notes: f.notes };
    setBusy(true);
    const res = await dispatch(editing ? updateExperience({ id: entry._id, ...body }) : createExperience({ professionalId: f.professional._id, ...body }));
    setBusy(false);
    if (res.error) {
      const d = res.payload?.details || {};
      setErrors({ serviceUsed: d.serviceUsed?.[0], experienceDate: d.experienceDate?.[0], notes: d.notes?.[0] });
      return toast.error(res.payload?.message || 'Could not save');
    }
    toast.success(editing ? 'Experience updated' : 'Experience saved');
    onSaved?.(res.payload);
    onClose();
  };

  const locked = editing || !!preset?.professional;
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit experience' : 'Log an experience'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="experience-form" loading={busy}>{editing ? 'Save changes' : 'Save experience'}</Button></>}>
      <form id="experience-form" className="space-y-4" onSubmit={submit} noValidate>
        {locked ? <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">With </span><strong>{f.professional?.fullName}</strong></div>
          : <ProfessionalPicker value={f.professional} onChange={(p) => set({ professional: p })} error={errors.professional} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Service used" required maxLength={100} list="exp-services" value={f.serviceUsed} onChange={(e) => set({ serviceUsed: e.target.value })} error={errors.serviceUsed} />
          <datalist id="exp-services">{(f.professional?.services || []).map((s) => <option key={s} value={s} />)}</datalist>
          <Input label="Date" type="date" required max={today()} value={f.experienceDate} onChange={(e) => set({ experienceDate: e.target.value })} error={errors.experienceDate} />
        </div>
        <Select label="Your rating (private)" value={f.rating} onChange={(e) => set({ rating: e.target.value })} options={RATINGS} />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Would you recommend them?</legend>
          <div className="flex gap-2">{REC.map(([v, l]) => <button type="button" key={v} aria-pressed={f.wouldRecommend === v} onClick={() => set({ wouldRecommend: f.wouldRecommend === v ? '' : v })}
            className={`rounded-full border px-4 py-1.5 text-sm ${f.wouldRecommend === v ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}</div>
        </fieldset>
        <div>
          <label htmlFor="exp-notes" className="mb-1.5 block text-sm font-medium text-slate-700">Private notes</label>
          <textarea id="exp-notes" rows={4} maxLength={1000} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="What went well, what to remember next time…"
            className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <p className="mt-1 text-right text-xs text-slate-500">{f.notes.length}/1000</p>
        </div>
        <p className="text-xs text-slate-500">Only you can see this. It is not published as a review.</p>
      </form>
    </Modal>
  );
}
