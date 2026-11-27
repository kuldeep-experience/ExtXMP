import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Clock, ExternalLink, GitCompareArrows, History, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, ListSkeleton, PageHeader, Pagination, Skeleton } from '../components/ui/index.js';
import { useToast } from '../context/ToastContext.jsx';
import ProfessionalMiniCard from '../features/history/ProfessionalMiniCard.jsx';
import { clearHistory, fetchComparisons, fetchSearchHistory, fetchViewed, removeHistoryItem } from '../features/history/historySlice.js';
import BookmarkButton from '../features/saved/BookmarkButton.jsx';
import { selectUser, updateProfile } from '../features/auth/authSlice.js';
import { fmtDate } from '../lib/format.js';
import { searchChips, searchUrl } from '../lib/history.js';

const PAGE_SIZE = 12;

function Section({ icon: Icon, title, subtitle, action, children }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5 text-brand-600" />{title}</h2>{subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}
const clearBtn = (onClick, label) => <Button size="sm" variant="ghost" className="text-red-600" onClick={onClick}>{label}</Button>;

export default function RecentlyViewed() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const user = useSelector(selectUser);
  const { viewed, searches, comparisons } = useSelector((s) => s.history);
  const tracking = user.privacySettings?.trackHistory !== false;
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null); // { title, text, kinds }

  const loadViewed = useCallback(() => dispatch(fetchViewed({ page, limit: PAGE_SIZE })), [dispatch, page]);
  const loadAll = useCallback(() => { loadViewed(); dispatch(fetchSearchHistory({ limit: 10 })); dispatch(fetchComparisons({ limit: 10 })); }, [dispatch, loadViewed]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const remove = async (kind, id, message) => {
    const res = await dispatch(removeHistoryItem({ kind, id }));
    res.error ? toast.error(res.payload?.message) : toast.info(message);
    if (kind === 'viewed') loadViewed();
  };
  const runClear = async () => {
    const c = confirm; setConfirm(null);
    const res = await dispatch(clearHistory(c.kinds));
    res.error ? toast.error(res.payload?.message) : toast.success(`Deleted ${res.payload.deleted} record${res.payload.deleted === 1 ? '' : 's'}.`);
    setPage(1);
  };
  const toggleTracking = async () => {
    const res = await dispatch(updateProfile({ privacySettings: { trackHistory: !tracking } }));
    res.error ? toast.error(res.payload?.message) : toast.info(!tracking ? 'History tracking is on.' : 'History tracking is off. Nothing new will be saved.');
  };

  const lastView = viewed.items[0], lastSearch = searches.items[0], lastCompare = comparisons.items[0];
  const settled = [viewed, searches, comparisons].every((s) => s.status === 'ready');
  const nothing = settled && [viewed, searches, comparisons].every((s) => s.items.length === 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader icon={Clock} title="Recently Viewed" description="Pick up where you left off. Only you can see this history." />

      <Card className={tracking ? '' : 'border-amber-200 bg-amber-50'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm"><ShieldCheck className="h-5 w-5 shrink-0 text-brand-600" />
            {tracking ? <span><strong>History tracking is on.</strong> Profiles you open, searches and comparisons are saved for {user.privacySettings?.historyRetentionDays ?? 90} days.</span> : <span><strong>History tracking is off.</strong> Nothing new is being saved.</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={toggleTracking}>{tracking ? 'Turn off tracking' : 'Turn on tracking'}</Button>
            <Link to="/dashboard/settings#privacy"><Button size="sm" variant="ghost">Privacy settings</Button></Link>
            <Button size="sm" variant="ghost" className="text-red-600" disabled={nothing} onClick={() => setConfirm({ title: 'Clear all history?', text: 'This permanently deletes the professionals you viewed, your searches and your comparisons.', kinds: ['viewed', 'searches', 'comparisons'] })}>Clear all history</Button>
          </div>
        </div>
      </Card>

      {nothing && (
        <EmptyState icon={History} title="No history yet" description={tracking ? 'Professionals you open, searches you run and comparisons you make will appear here.' : 'Turn tracking on to start keeping a history.'}
          action={<Link to="/professionals"><Button>Browse professionals</Button></Link>} />
      )}

      {(lastView || lastSearch || lastCompare) && (
        <Section icon={ExternalLink} title="Continue where you left off">
          <div className="grid gap-4 md:grid-cols-3">
            {lastView && <ProfessionalMiniCard pro={lastView.professional}><p className="mb-2 text-xs text-slate-500">Last profile · {fmtDate(lastView.lastViewedAt)}</p><Link to={`/professionals/${lastView.professional._id}`}><Button size="sm" className="w-full">Open profile</Button></Link></ProfessionalMiniCard>}
            {lastSearch && (
              <Card className="flex flex-col"><p className="text-xs text-slate-500">Last search · {fmtDate(lastSearch.searchedAt)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{searchChips(lastSearch).map((c) => <Badge key={c} tone="gray">{c}</Badge>)}</div>
                <p className="mt-2 text-sm text-slate-600">{lastSearch.resultsCount} result{lastSearch.resultsCount === 1 ? '' : 's'}</p>
                <Button size="sm" className="mt-auto w-full" onClick={() => navigate(searchUrl(lastSearch))}>Search again</Button></Card>
            )}
            {lastCompare && (
              <Card className="flex flex-col"><p className="text-xs text-slate-500">Last comparison · {fmtDate(lastCompare.comparedAt)}</p>
                <div className="mt-2 flex -space-x-2">{lastCompare.professionals.map((p) => <Avatar key={p._id} name={p.fullName} src={p.profileImage} size="h-10 w-10 text-sm ring-2 ring-white" />)}</div>
                <p className="mt-2 text-sm text-slate-600">{lastCompare.professionals.map((p) => p.fullName).join(', ')}</p>
                <Link to={`/compare?ids=${lastCompare.professionals.map((p) => p._id).join(',')}`} className="mt-auto pt-3"><Button size="sm" className="w-full">Compare again</Button></Link></Card>
            )}
          </div>
        </Section>
      )}

      <Section icon={Clock} title="Recently viewed professionals" subtitle={viewed.pagination ? `${viewed.pagination.total} professional${viewed.pagination.total === 1 ? '' : 's'}` : null}
        action={viewed.items.length > 0 && clearBtn(() => setConfirm({ title: 'Clear viewed history?', text: 'This permanently deletes the list of professionals you viewed.', kinds: ['viewed'] }), 'Clear viewed history')}>
        {viewed.status === 'loading' && <ListSkeleton count={3} />}
        {viewed.status === 'failed' && <ErrorState message={`Could not load: ${viewed.error}`} onRetry={loadViewed} />}
        {viewed.status === 'ready' && viewed.items.length === 0 && <EmptyState title="You haven't viewed any professionals yet" />}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {viewed.items.map((v) => (
            <ProfessionalMiniCard key={v._id} pro={v.professional}
              actions={<div className="flex"><BookmarkButton professionalId={v.professional._id} /><button onClick={() => remove('viewed', v._id, 'Removed from history.')} aria-label={`Remove ${v.professional.fullName} from history`} title="Remove from history" className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-5 w-5" /></button></div>}>
              <p className="mb-2 text-xs text-slate-500">Viewed {v.viewCount} time{v.viewCount === 1 ? '' : 's'} · last {fmtDate(v.lastViewedAt)}</p>
              <Link to={`/professionals/${v.professional._id}`}><Button size="sm" variant="secondary" className="w-full">Open profile</Button></Link>
            </ProfessionalMiniCard>
          ))}
        </div>
        {viewed.pagination && <Pagination page={viewed.pagination.page} totalPages={viewed.pagination.totalPages} onChange={setPage} />}
      </Section>

      <Section icon={Search} title="Recent searches" action={searches.items.length > 0 && clearBtn(() => setConfirm({ title: 'Clear search history?', text: 'This permanently deletes your recent searches.', kinds: ['searches'] }), 'Clear search history')}>
        {searches.status === 'loading' && <Skeleton className="h-20" />}
        {searches.status === 'ready' && searches.items.length === 0 && <EmptyState title="No searches yet" description="Search the directory and your searches will show up here." />}
        <div className="space-y-3">
          {searches.items.map((s) => (
            <Card key={s._id} className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5">{searchChips(s).map((c, i) => <Badge key={c} tone={i === 0 ? 'blue' : 'gray'}>{c}</Badge>)}</div>
                <p className="mt-1.5 text-xs text-slate-500">{s.resultsCount} result{s.resultsCount === 1 ? '' : 's'} · {fmtDate(s.searchedAt)}</p>
              </div>
              <Button size="sm" onClick={() => navigate(searchUrl(s))}><Search className="h-4 w-4" />Search again</Button>
              <button onClick={() => remove('searches', s._id, 'Search removed.')} aria-label="Remove this search" title="Remove" className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-5 w-5" /></button>
            </Card>
          ))}
        </div>
      </Section>

      <Section icon={GitCompareArrows} title="Recent comparisons" action={comparisons.items.length > 0 && clearBtn(() => setConfirm({ title: 'Clear comparison history?', text: 'This permanently deletes your recent comparisons.', kinds: ['comparisons'] }), 'Clear comparisons')}>
        {comparisons.status === 'loading' && <Skeleton className="h-24" />}
        {comparisons.status === 'ready' && comparisons.items.length === 0 && <EmptyState title="No comparisons yet" description="Tick “Compare” on two to four professionals in the directory." />}
        <div className="grid gap-4 lg:grid-cols-2">
          {comparisons.items.map((c) => (
            <Card key={c._id}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-slate-500">Compared {fmtDate(c.comparedAt)}{c.unavailable > 0 && ` · ${c.unavailable} no longer available`}</p>
                <button onClick={() => remove('comparisons', c._id, 'Comparison removed.')} aria-label="Remove this comparison" title="Remove" className="-mt-1 rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <ul className="mt-2 space-y-2">{c.professionals.map((p) => <li key={p._id} className="flex items-center gap-2 text-sm"><Avatar name={p.fullName} src={p.profileImage} size="h-8 w-8 text-xs" /><Link to={`/professionals/${p._id}`} className="font-medium hover:text-brand-600">{p.fullName}</Link><span className="text-slate-500">{p.averageRating.toFixed(1)}★ · {p.location}</span></li>)}</ul>
              {c.professionals.length >= 2 && <Link to={`/compare?ids=${c.professionals.map((p) => p._id).join(',')}`} className="mt-3 inline-block"><Button size="sm" variant="secondary">Revisit comparison</Button></Link>}
            </Card>
          ))}
        </div>
      </Section>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title} message={confirm?.text} onConfirm={runClear} />
    </div>
  );
}
