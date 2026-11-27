import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Input, Modal, ProfessionalPicker, Select } from '../../components/ui/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { createServiceRecord, updateServiceRecord } from './serviceRecordsSlice.js';

export const STATUS = { planned: ['Planned', 'gray'], in_progress: ['In progress', 'amber'], completed: ['Completed', 'green'] };
const options = Object.entries(STATUS).map(([value, [label]]) => ({ value, label }));
export const money = (cents) => (cents == null ? '—' : (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' }));
const blank = { professional: null, serviceName: '', serviceDate: '', status: 'completed', amount: '', summary: '' };

// Log (create) or edit a record of a service a professional performed for you.
export default function ServiceRecordModal({ open, onClose, record = null, onSaved }) {
  const dispatch = useDispatch();
  const toast = useToast();
  const editing = !!record;
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((v) => ({ ...v, ...patch }));

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(record ? { professional: record.professional, serviceName: record.serviceName, serviceDate: record.serviceDate.slice(0, 10), status: record.status, amount: record.amountCents == null ? '' : String(record.amountCents / 100), summary: record.summary || '' } : blank);
  }, [open, record]);

  const submit = async (e) => {
    e.preventDefault();
    const err = {};
    if (!f.professional) err.professional = 'Choose a professional';
    if (!f.serviceName.trim()) err.serviceName = 'Required';
    if (!f.serviceDate) err.serviceDate = 'Choose a date';
    const amount = f.amount === '' ? null : Number(f.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) err.amount = 'Enter an amount of 0 or more';
    setErrors(err);
    if (Object.keys(err).length) return;
    const body = { serviceName: f.serviceName.trim(), serviceDate: new Date(f.serviceDate).toISOString(), status: f.status, amountCents: amount === null ? null : Math.round(amount * 100), summary: f.summary };
    setBusy(true);
    const res = await dispatch(editing ? updateServiceRecord({ id: record._id, ...body }) : createServiceRecord({ professionalId: f.professional._id, ...body }));
    setBusy(false);
    if (res.error) {
      const d = res.payload?.details || {};
      setErrors({ serviceName: d.serviceName?.[0], serviceDate: d.serviceDate?.[0], amount: d.amountCents?.[0], summary: d.summary?.[0] });
      return toast.error(res.payload?.message || 'Could not save');
    }
    toast.success(editing ? 'Service record updated' : 'Service record saved');
    onSaved?.(res.payload);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit service record' : 'Add a service record'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="service-form" loading={busy}>{editing ? 'Save changes' : 'Save record'}</Button></>}>
      <form id="service-form" className="space-y-4" onSubmit={submit} noValidate>
        {editing ? <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">By </span><strong>{f.professional?.fullName}</strong></div>
          : <ProfessionalPicker value={f.professional} onChange={(p) => set({ professional: p })} error={errors.professional} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Service" required maxLength={100} list="svc-names" value={f.serviceName} onChange={(e) => set({ serviceName: e.target.value })} error={errors.serviceName} />
          <datalist id="svc-names">{(f.professional?.services || []).map((s) => <option key={s} value={s} />)}</datalist>
          <Input label="Date" type="date" required value={f.serviceDate} onChange={(e) => set({ serviceDate: e.target.value })} error={errors.serviceDate} />
          <Select label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })} options={options} />
          <Input label="Cost in USD (optional)" type="number" min="0" step="0.01" value={f.amount} onChange={(e) => set({ amount: e.target.value })} error={errors.amount} />
        </div>
        <div>
          <label htmlFor="svc-summary" className="mb-1.5 block text-sm font-medium text-slate-700">Summary (optional)</label>
          <textarea id="svc-summary" rows={3} maxLength={1000} value={f.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="What was done, deliverables, follow-ups…"
            className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </form>
    </Modal>
  );
}
