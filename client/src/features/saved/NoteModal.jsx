import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Modal } from '../../components/ui/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { updateSaved } from './savedSlice.js';

const MAX = 1000;

export default function NoteModal({ item, onClose }) {
  const dispatch = useDispatch();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setText(item?.note || ''); }, [item]);
  if (!item) return null;

  const save = async (value, message) => {
    setBusy(true);
    const res = await dispatch(updateSaved({ id: item._id, note: value }));
    setBusy(false);
    if (res.error) return toast.error(res.payload?.message || 'Could not save note');
    toast.success(message);
    onClose();
  };
  const unchanged = text.trim() === (item.note || '');

  return (
    <Modal open onClose={onClose} title={`Private note: ${item.professional.fullName}`}
      footer={<>
        {item.note && <Button variant="ghost" className="mr-auto text-red-600" onClick={() => save('', 'Note deleted')} disabled={busy}>Delete note</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save(text, 'Note saved')} loading={busy} disabled={unchanged || !text.trim()}>Save note</Button>
      </>}>
      <label htmlFor="note-text" className="mb-1.5 block text-sm font-medium text-slate-700">Only you can see this note</label>
      <textarea id="note-text" rows={5} maxLength={MAX} autoFocus value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Questions to ask, availability, why you saved them…"
        className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      <p className="mt-1 text-right text-xs text-slate-500">{text.length}/{MAX}</p>
    </Modal>
  );
}
