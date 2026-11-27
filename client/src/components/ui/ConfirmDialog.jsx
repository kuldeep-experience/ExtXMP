import Button from './Button.jsx';
import Modal from './Modal.jsx';

// Confirmation for destructive actions. The confirm button runs onConfirm; the dialog closes itself.
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', danger = true, busy = false, onConfirm, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="text-sm text-slate-700">{message}</div>
    </Modal>
  );
}
