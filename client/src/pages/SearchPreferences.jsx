import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Plus, Search, SearchX, SlidersHorizontal } from 'lucide-react';
import { Badge, Button, Card, Input, Loader, Modal, Pagination, Select } from '../components/ui/index.js';
import { useToast } from '../context/ToastContext.jsx';
import SearchCard from '../features/searches/SearchCard.jsx';
import SearchFormModal from '../features/searches/SearchFormModal.jsx';
import { deleteSearch, fetchSearches, runSearch } from '../features/searches/searchesSlice.js';
import { directoryUrl } from '../features/searches/criteria.js';

const PAGE_SIZE = 12;
const sorts = [{ value: 'used', label: 'Recently used' }, { value: 'created', label: 'Recently created' }];

export default function SearchPreferences() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { items, pagination, status, error } = useSelector((s) => s.searches.list);
  const q = params.get('q') || '';
  const sort = params.get('sort') || 'used';
  const page = Number(params.get('page') || 1);
  const [search, setSearch] = useState(q);
  const [modal, setModal] = useState({ open: false, item: null });
  const [removeItem, setRemoveItem] = useState(null);
  const [runningId, setRunningId] = useState(null);

  const update = useCallback((changes, keepPage = false) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!keepPage) next.delete('page');
    return next;
  }, { replace: true }), [setParams]);

  const load = useCallback(() => dispatch(fetchSearches({ ...(q && { q }), sort, page, limit: PAGE_SIZE })), [dispatch, q, sort, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => search !== q && update({ q: search.trim() }), 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (s) => {
    setRunningId(s._id);
    const res = await dispatch(runSearch(s._id));
    setRunningId(null);
    if (res.error) return toast.error(res.payload?.message || 'Could not run the search');
    navigate(directoryUrl(res.payload.data, res.payload.query)); // the directory page restores every filter
  };
  const confirmDelete = async () => {
    const item = removeItem;
    setRemoveItem(null);
    const res = await dispatch(deleteSearch(item._id));
    if (res.error) return toast.error(res.payload?.message);
    toast.info('Saved search deleted.');
    load();
  };

  const noneAtAll = status === 'succeeded' && pagination?.total === 0 && !q;
  const total = pagination?.total ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Search Preferences</h1>
          <p className="mt-1 text-sm text-slate-500">{pagination && !q && <Badge tone="blue">{total} saved</Badge>} <span className="ml-1">Save the filters you use often and run them again in one click.</span></p>
        </div>
        <Button onClick={() => setModal({ open: true, item: null })}><Plus className="h-4 w-4" />New search</Button>
      </div>

      {noneAtAll ? (
        <Card className="flex flex-col items-center py-16 text-center">
          <SlidersHorizontal className="h-12 w-12 text-slate-300" />
          <h2 className="mt-3 text-lg font-semibold">No saved searches yet</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">Create one here, or search the directory and choose “Save this search”.</p>
          <div className="mt-5 flex gap-2"><Button onClick={() => setModal({ open: true, item: null })}>New search</Button><Link to="/professionals"><Button variant="secondary">Browse professionals</Button></Link></div>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
            <Input icon={Search} placeholder="Search your saved searches" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search saved searches" />
            <Select aria-label="Sort by" value={sort} onChange={(e) => update({ sort: e.target.value === 'used' ? '' : e.target.value })} options={sorts} />
          </div>
          {status === 'loading' && !items.length && <Loader label="Loading saved searches…" />}
          {status === 'failed' && <Card className="text-center"><p className="text-red-600">Could not load saved searches: {error}</p><Button className="mt-3" variant="secondary" onClick={load}>Try again</Button></Card>}
          {status === 'succeeded' && items.length === 0 && (
            <Card className="flex flex-col items-center py-14 text-center"><SearchX className="h-10 w-10 text-slate-300" /><p className="mt-3 font-medium">No saved searches match “{q}”</p>
              <Button className="mt-4" variant="secondary" onClick={() => { setSearch(''); setParams({}); }}>Clear search</Button></Card>
          )}
          <div className={`grid gap-4 md:grid-cols-2 xl:grid-cols-3 ${status === 'loading' ? 'opacity-60' : ''}`}>
            {items.map((s) => <SearchCard key={s._id} search={s} running={runningId === s._id} onRun={run} onEdit={(x) => setModal({ open: true, item: x })} onDelete={setRemoveItem} />)}
          </div>
          {pagination && <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={(n) => update({ page: n > 1 ? n : '' }, true)} />}
        </>
      )}

      <SearchFormModal open={modal.open} mode={modal.item ? 'edit' : 'create'} initial={modal.item} onClose={() => setModal({ open: false, item: null })} onSaved={load} />
      <Modal open={!!removeItem} onClose={() => setRemoveItem(null)} title="Delete saved search?"
        footer={<><Button variant="secondary" onClick={() => setRemoveItem(null)}>Cancel</Button><Button variant="danger" onClick={confirmDelete}>Delete</Button></>}>
        <p className="text-sm text-slate-700">Delete <strong>{removeItem?.name}</strong>? You can always create it again.</p>
      </Modal>
    </div>
  );
}
