import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Modal, ProfessionalPicker } from '../../components/ui/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { startThread } from './conversationsSlice.js';

// Contact a professional: sends the first (or next) message. If a thread with them exists, the message is added to it.
export default function StartChatModal({ open, onClose, professional = null }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const [pro, setPro] = useState(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setPro(professional); setSubject(''); setMessage(''); setErrors({}); } }, [open, professional]);

  const submit = async (e) => {
    e.preventDefault();
    const err = {};
    if (!pro) err.professional = 'Choose a professional';
    if (!message.trim()) err.message = 'Type a message';
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    const res = await dispatch(startThread({ professionalId: pro._id, message: message.trim(), ...(subject.trim() && { subject: subject.trim() }) }));
    setBusy(false);
    if (res.error) { setErrors({ message: res.payload?.details?.message?.[0] }); return toast.error(res.payload?.message || 'Could not send'); }
    toast.success('Message sent. The professional will be emailed.');
    onClose();
    navigate(`/dashboard/contacts/${res.payload.data._id}`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Contact a professional"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="start-chat-form" loading={busy}>Contact</Button></>}>
      <form id="start-chat-form" className="space-y-4" onSubmit={submit} noValidate>
        {professional ? <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">To </span><strong>{professional.fullName}</strong></div>
          : <ProfessionalPicker label="To" value={pro} onChange={setPro} error={errors.professional} />}
        <Input label="Subject (optional)" maxLength={100} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <div>
          <label htmlFor="chat-message" className="mb-1.5 block text-sm font-medium text-slate-700">Message</label>
          <textarea id="chat-message" rows={5} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Introduce yourself and describe what you need…"
            className={`w-full rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${errors.message ? 'border-red-400' : 'border-slate-300'}`} />
          {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message}</p>}
          <p className="mt-1 text-right text-xs text-slate-500">{message.length}/2000</p>
        </div>
        <p className="text-xs text-slate-500">The professional gets your message by email and replies from their own inbox. You will get an email when they reply, and the reply appears in your chat. (Demo: this proof of concept has no professional inbox; emails go to a development mailbox only.)</p>
      </form>
    </Modal>
  );
}
