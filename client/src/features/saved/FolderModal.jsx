import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Input, Modal } from '../../components/ui/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { createFolder, deleteFolder, fetchFolders, updateFolder } from './savedSlice.js';

// Create (folder = null) or edit/delete an existing folder.
export default function FolderModal({ open, folder, onClose, onDeleted }) {
  const dispatch = useDispatch();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setName(folder?.name || ''); setDescription(folder?.description || ''); setErrors({}); setConfirming(false); }
  }, [open, folder]);

  const run = async (action, success) => {
    setBusy(true);
    const res = await dispatch(action);
    setBusy(false);
    if (res.error) { setErrors(res.payload?.details || {}); toast.error(res.payload?.message || 'Request failed'); return false; }
    toast.success(success);
    dispatch(fetchFolders());
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    const ok = folder
      ? await run(updateFolder({ id: folder._id, name, description }), 'Folder updated')
      : await run(createFolder({ name, ...(description && { description }) }), 'Folder created');
    if (ok) onClose();
  };

  const remove = async () => {
    if (await run(deleteFolder(folder._id), 'Folder deleted')) { onDeleted?.(folder._id); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose} title={folder ? 'Manage folder' : 'New folder'}
      footer={confirming && folder ? (
        <>
          <Button variant="secondary" onClick={() => setConfirming(false)}>Keep folder</Button>
          <Button variant="danger" onClick={remove} loading={busy}>Delete folder</Button>
        </>
      ) : (
        <>
          {folder && <Button variant="ghost" className="mr-auto text-red-600" onClick={() => setConfirming(true)}>Delete…</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="folder-form" loading={busy}>{folder ? 'Save changes' : 'Create folder'}</Button>
        </>
      )}>
      {confirming && folder ? (
        <p className="text-sm text-slate-700">Delete <strong>{folder.name}</strong>? Its {folder.count} saved professional{folder.count === 1 ? '' : 's'} will not be removed. They move to Unfiled.</p>
      ) : (
        <form id="folder-form" className="space-y-4" onSubmit={submit} noValidate>
          <Input label="Folder name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} error={errors.name?.[0]} autoFocus />
          <Input label="Description (optional)" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description?.[0]} />
        </form>
      )}
    </Modal>
  );
}
