import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { CalendarDays, History, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, ListSkeleton, Pagination, RatingStars, Select } from '../../components/ui/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import ExperienceModal from './ExperienceModal.jsx';
import { deleteExperience, fetchExperiences, selectExperiences } from './experienceSlice.js';
import { fmtDate } from '../../lib/format.js';

const PAGE_SIZE = 8;
const REC = { yes: ['Would recommend', 'green'], no: ['Would not recommend', 'red'], unsure: ['Not sure', 'amber'] };
const sorts = [{ value: 'recent', label: 'Most recent' }, { value: 'rating', label: 'Highest rated' }];

export default function ExperiencesTab() {
  const dispatch = useDispatch();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const sort = params.get('sort') || 'recent';
  const page = Number(params.get('page') || 1);
  const list = useSelector(selectExperiences('main'));
  const [search, setSearch] = useState(q);
  const [modal, setModal] = useState({ open: false, entry: null });
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = useCallback((changes, keepPage = false) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!keepPage) next.delete('page');
    return next;
  }, { replace: true }), [setParams]);

  const load = useCallback(() => dispatch(fetchExperiences({ key: 'main', ...(q && { q }), sort, page, limit: PAGE_SIZE })), [dispatch, q, sort, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => search !== q && update({ q: search.trim() }), 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async () => {
    setBusy(true);
    const res = await dispatch(deleteExperience(removing._id));
    setBusy(false); setRemoving(null);
    res.error ? toast.error(res.payload?.message) : toast.info('Experience deleted.');
    load();
  };

  const none = list.status === 'succeeded' && list.pagination?.total === 0 && !q;
  return (
    <div className="space-y-6">
      <div className="flex justify-end"><Button onClick={() => setModal({ open: true, entry: null })}><Plus className="h-4 w-4" />Log an experience</Button></div>
      {none ? (
        <EmptyState icon={History} title="No experiences logged yet" description="Log what you used, when, and how it went, so you remember who to call again."
          action={<Button onClick={() => setModal({ open: true, entry: null })}>Log an experience</Button>} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <Input icon={Search} placeholder="Search by professional, service or notes" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search experiences" />
            <Select aria-label="Sort by" value={sort} onChange={(e) => update({ sort: e.target.value === 'recent' ? '' : e.target.value })} options={sorts} />
          </div>
          {list.status === 'loading' && !list.items.length && <ListSkeleton count={4} className="grid gap-4 md:grid-cols-2" />}
          {list.status === 'failed' && <ErrorState message={`Could not load experiences: ${list.error}`} onRetry={load} />}
          {list.status === 'succeeded' && list.items.length === 0 && <EmptyState title={`No experiences match “${q}”`} action={<Button variant="secondary" onClick={() => { setSearch(''); setParams({ tab: 'experiences' }); }}>Clear search</Button>} />}
          <div className={`grid gap-4 md:grid-cols-2 ${list.status === 'loading' ? 'opacity-60' : ''}`}>
            {list.items.map((e) => (
              <Card key={e._id} className="flex flex-col">
                <div className="flex items-start gap-3">
                  <Avatar name={e.professional.fullName} src={e.professional.profileImage} size="h-12 w-12 text-base" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/professionals/${e.professional._id}`} className="block truncate font-semibold text-slate-900 hover:text-brand-600">{e.professional.fullName}</Link>
                    <p className="truncate text-sm text-slate-600">{e.professional.title} · {e.professional.category}</p>
                  </div>
                  <div className="flex"><button onClick={() => setModal({ open: true, entry: e })} aria-label={`Edit experience with ${e.professional.fullName}`} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setRemoving(e)} aria-label={`Delete experience with ${e.professional.fullName}`} className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="blue">{e.serviceUsed}</Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(e.experienceDate)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {e.rating && <span className="inline-flex items-center gap-1.5 text-sm"><RatingStars value={e.rating} /><span className="text-xs text-slate-500">Your rating</span></span>}
                  {e.wouldRecommend && <Badge tone={REC[e.wouldRecommend][1]}>{REC[e.wouldRecommend][0]}</Badge>}
                </div>
                {e.notes && <p className="mt-3 whitespace-pre-line rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{e.notes}</p>}
              </Card>
            ))}
          </div>
          {list.pagination && <Pagination page={list.pagination.page} totalPages={list.pagination.totalPages} onChange={(n) => update({ page: n > 1 ? n : '' }, true)} />}
        </>
      )}

      <ExperienceModal open={modal.open} entry={modal.entry} onClose={() => setModal({ open: false, entry: null })} onSaved={load} />
      <ConfirmDialog open={!!removing} busy={busy} onClose={() => setRemoving(null)} onConfirm={remove} title="Delete this experience?"
        message={removing && <p>Your private record of <strong>{removing.serviceUsed}</strong> with {removing.professional.fullName} will be deleted. This cannot be undone.</p>} />
    </div>
  );
}
