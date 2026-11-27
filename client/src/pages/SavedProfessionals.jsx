import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Bookmark, FolderPlus, Folders, Inbox, Pencil, Search, SearchX } from 'lucide-react';
import { Badge, Button, Card, Input, ListSkeleton, Modal, Pagination, Select } from '../components/ui/index.js';
import { useToast } from '../context/ToastContext.jsx';
import SavedCard from '../features/saved/SavedCard.jsx';
import FolderModal from '../features/saved/FolderModal.jsx';
import NoteModal from '../features/saved/NoteModal.jsx';
import { fetchFolders, fetchSaved, removeSaved, updateSaved } from '../features/saved/savedSlice.js';

const PAGE_SIZE = 12;
const sorts = [{ value: 'recent', label: 'Recently saved' }, { value: 'name', label: 'Name (A–Z)' }, { value: 'rating', label: 'Highest rated' }];

export default function SavedProfessionals() {
  const dispatch = useDispatch();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { items, pagination, status, error } = useSelector((s) => s.saved.list);
  const { items: folders, totals, status: folderStatus } = useSelector((s) => s.saved.folders);

  const folder = params.get('folder') || ''; // '' = all, 'unfiled', or a folder id
  const q = params.get('q') || '';
  const sort = params.get('sort') || 'recent';
  const page = Number(params.get('page') || 1);
  const [search, setSearch] = useState(q);
  const [folderModal, setFolderModal] = useState({ open: false, folder: null });
  const [noteItem, setNoteItem] = useState(null);
  const [removeItem, setRemoveItem] = useState(null);

  const update = useCallback((changes, keepPage = false) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
      if (!keepPage) next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);

  const query = { folder, q, sort, page, limit: PAGE_SIZE };
  const load = useCallback(() => dispatch(fetchSaved(Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '')))), [dispatch, folder, q, sort, page]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => { dispatch(fetchFolders()); load(); }, [dispatch, load]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { dispatch(fetchFolders()); }, [dispatch]);
  useEffect(() => { const t = setTimeout(() => search !== q && update({ q: search.trim() }), 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = async (item, folderId) => {
    const res = await dispatch(updateSaved({ id: item._id, folderId }));
    if (res.error) return toast.error(res.payload?.message);
    toast.success('Moved');
    refresh();
  };
  const confirmRemove = async () => {
    const item = removeItem;
    const res = await dispatch(removeSaved({ id: item._id, professionalId: item.professional._id }));
    setRemoveItem(null);
    if (res.error) return toast.error(res.payload?.message);
    toast.info('Removed from saved professionals.');
    refresh();
  };

  const current = folder === 'unfiled' ? 'Unfiled' : folders.find((f) => f._id === folder)?.name || 'All Saved Professionals';
  const nothingSaved = folderStatus === 'succeeded' && totals.all === 0;
  const filtered = !!(q || folder);
  const folderOptions = [{ value: '', label: `All saved (${totals.all})` }, { value: 'unfiled', label: `Unfiled (${totals.unfiled})` }, ...folders.map((f) => ({ value: f._id, label: `${f.name} (${f.count})` }))];
  const navItem = (value, label, count) => (
    <button key={value || 'all'} onClick={() => update({ folder: value })} aria-current={folder === value ? 'true' : undefined}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${folder === value ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
      <span className="truncate">{label}</span><span className="ml-2 text-xs text-slate-500">{count}</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Saved Professionals</h1>
          <p className="mt-1 text-sm text-slate-500"><Badge tone="blue">{totals.all} saved</Badge> <span className="ml-1">Bookmarks, folders and private notes, visible only to you.</span></p>
        </div>
        <Button onClick={() => setFolderModal({ open: true, folder: null })}><FolderPlus className="h-4 w-4" />New folder</Button>
      </div>

      {nothingSaved ? (
        <Card className="flex flex-col items-center py-16 text-center">
          <Bookmark className="h-12 w-12 text-slate-300" />
          <h2 className="mt-3 text-lg font-semibold">You haven't saved any professionals yet</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">Tap the bookmark on any professional to keep them here, then organize them into folders and add private notes.</p>
          <Link to="/professionals" className="mt-5"><Button>Browse professionals</Button></Link>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <aside>
            <Select aria-label="Folder" className="lg:hidden" value={folder} onChange={(e) => update({ folder: e.target.value })} options={folderOptions} />
            <Card className="hidden space-y-1 lg:block" title="Folders">
              {navItem('', <span className="flex items-center gap-2"><Folders className="h-4 w-4" />All Saved</span>, totals.all)}
              {navItem('unfiled', <span className="flex items-center gap-2"><Inbox className="h-4 w-4" />Unfiled</span>, totals.unfiled)}
              {folders.length > 0 && <hr className="my-2 border-slate-100" />}
              {folders.map((f) => (
                <div key={f._id} className="group flex items-center gap-1">
                  <div className="flex-1 min-w-0">{navItem(f._id, f.name, f.count)}</div>
                  <button onClick={() => setFolderModal({ open: true, folder: f })} aria-label={`Manage folder ${f.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                </div>
              ))}
            </Card>
            {folder && folder !== 'unfiled' && folders.find((f) => f._id === folder) && (
              <Button variant="ghost" size="sm" className="mt-2 lg:hidden" onClick={() => setFolderModal({ open: true, folder: folders.find((f) => f._id === folder) })}><Pencil className="h-4 w-4" />Manage this folder</Button>
            )}
          </aside>

          <section aria-live="polite">
            <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
              <Input icon={Search} placeholder="Search saved professionals and notes" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search saved professionals" />
              <Select aria-label="Sort by" value={sort} onChange={(e) => update({ sort: e.target.value === 'recent' ? '' : e.target.value })} options={sorts} />
            </div>
            <p className="mb-3 text-sm text-slate-600"><strong>{current}</strong>{pagination ? ` · ${pagination.total} professional${pagination.total === 1 ? '' : 's'}` : ''}</p>

            {status === 'loading' && !items.length && <ListSkeleton count={4} className="grid gap-4 xl:grid-cols-2" />}
            {status === 'failed' && <Card className="text-center"><p className="text-red-600">Could not load saved professionals: {error}</p><Button className="mt-3" variant="secondary" onClick={load}>Try again</Button></Card>}
            {status === 'succeeded' && items.length === 0 && (
              <Card className="flex flex-col items-center py-14 text-center">
                <SearchX className="h-10 w-10 text-slate-300" />
                <p className="mt-3 font-medium">{filtered ? 'No saved professionals match' : 'Nothing here yet'}</p>
                <p className="text-sm text-slate-500">{folder ? 'This folder is empty. Move professionals into it from their card.' : 'Try a different search.'}</p>
                {filtered && <Button className="mt-4" variant="secondary" onClick={() => { setSearch(''); setParams({}); }}>Clear filters</Button>}
              </Card>
            )}
            <div className={`grid gap-4 xl:grid-cols-2 ${status === 'loading' ? 'opacity-60' : ''}`}>
              {items.map((i) => <SavedCard key={i._id} item={i} folders={folders} onMove={move} onNote={setNoteItem} onRemove={setRemoveItem} />)}
            </div>
            {pagination && <div className="mt-6"><Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={(n) => update({ page: n > 1 ? n : '' }, true)} /></div>}
          </section>
        </div>
      )}

      <FolderModal open={folderModal.open} folder={folderModal.folder} onClose={() => setFolderModal({ open: false, folder: null })}
        onDeleted={(id) => { if (folder === id) update({ folder: '' }); else refresh(); }} />
      <NoteModal item={noteItem} onClose={() => { setNoteItem(null); }} key={noteItem?._id || 'none'} />
      <Modal open={!!removeItem} onClose={() => setRemoveItem(null)} title="Remove saved professional?"
        footer={<><Button variant="secondary" onClick={() => setRemoveItem(null)}>Cancel</Button><Button variant="danger" onClick={confirmRemove}>Remove</Button></>}>
        <p className="text-sm text-slate-700">Remove <strong>{removeItem?.professional.fullName}</strong> from your saved professionals? Your private note for them will be deleted too.</p>
      </Modal>
    </div>
  );
}
