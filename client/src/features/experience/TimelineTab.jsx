import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { ClipboardList, History, MessageSquare, Search, Star } from 'lucide-react';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, ListSkeleton, Pagination, RatingStars } from '../../components/ui/index.js';
import StartChatModal from '../conversations/StartChatModal.jsx';
import { STATUS, money } from '../serviceRecords/ServiceRecordModal.jsx';
import { fmtDate } from '../../lib/format.js';
import { fetchTimeline } from './experienceSlice.js';

const PAGE_SIZE = 10;
const TYPES = [['experience', 'Experiences', Star], ['service', 'Service records', ClipboardList], ['conversation', 'Contacts', MessageSquare]];
const ICON = Object.fromEntries(TYPES.map(([t, , I]) => [t, I]));
const LABEL = { experience: 'Experience', service: 'Service record', conversation: 'Contact' };

// Everything that happened with professionals, newest first. Filter by kind, date range or text.
export default function TimelineTab() {
  const dispatch = useDispatch();
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) || '';
  const page = Number(params.get('page') || 1);
  const types = get('types') ? get('types').split(',') : [];
  const list = useSelector((s) => s.experience.timeline);
  const [search, setSearch] = useState(get('q'));
  const [chat, setChat] = useState(null);

  const update = useCallback((changes, keepPage = false) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!keepPage) next.delete('page');
    return next;
  }, { replace: true }), [setParams]);

  const query = { types: get('types'), q: get('q'), from: get('from'), to: get('to') };
  const load = useCallback(() => dispatch(fetchTimeline({ ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)), page, limit: PAGE_SIZE })), [dispatch, query.types, query.q, query.from, query.to, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => search !== get('q') && update({ q: search.trim() }), 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (t) => update({ types: (types.includes(t) ? types.filter((x) => x !== t) : [...types, t]).join(',') });
  const filtered = Object.values(query).some(Boolean);
  const link = (i) => (i.type === 'conversation' ? `/dashboard/contacts/${i._id}` : null);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {TYPES.map(([t, label, Icon]) => (
            <button key={t} onClick={() => toggle(t)} aria-pressed={types.includes(t)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${types.includes(t) ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{label}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_10rem_auto]">
          <Input icon={Search} placeholder="Search by professional, service or notes" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search timeline" />
          <Input type="date" aria-label="From date" value={get('from')} onChange={(e) => update({ from: e.target.value })} />
          <Input type="date" aria-label="To date" value={get('to')} onChange={(e) => update({ to: e.target.value })} />
          {filtered && <Button variant="ghost" onClick={() => { setSearch(''); setParams({}); }}>Clear</Button>}
        </div>
      </div>

      {list.status === 'loading' && <ListSkeleton count={4} className="grid gap-3" />}
      {list.status === 'failed' && <ErrorState message={`Could not load your timeline: ${list.error}`} onRetry={load} />}
      {list.status === 'ready' && list.items.length === 0 && (
        <EmptyState icon={History} title={filtered ? 'Nothing matches these filters' : 'Your timeline is empty'} description={filtered ? undefined : 'Experiences you log, service records and professionals you contact appear here.'}
          action={filtered ? <Button variant="secondary" onClick={() => { setSearch(''); setParams({}); }}>Clear filters</Button> : <Link to="/professionals"><Button>Find a professional</Button></Link>} />
      )}
      <ol className={`relative space-y-4 border-l-2 border-slate-200 pl-6 ${list.status === 'refreshing' ? 'opacity-60' : ''}`}>
        {list.items.map((i) => {
          const Icon = ICON[i.type];
          const to = link(i);
          return (
            <li key={`${i.type}-${i._id}`} className="relative">
              <span className="absolute -left-[2.15rem] top-4 flex h-7 w-7 items-center justify-center rounded-full bg-white text-brand-600 ring-2 ring-slate-200"><Icon className="h-4 w-4" /></span>
              <Card className="!p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar name={i.professional.fullName} src={i.professional.profileImage} size="h-11 w-11 text-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2"><Badge tone="gray">{LABEL[i.type]}</Badge><span className="text-xs text-slate-500">{fmtDate(i.date)}</span></p>
                    <p className="mt-1 font-semibold text-slate-900 [overflow-wrap:anywhere]">{to ? <Link to={to} className="hover:text-brand-600">{i.title}</Link> : i.title}</p>
                    <Link to={`/professionals/${i.professional._id}`} className="text-sm text-slate-600 hover:text-brand-600">{i.professional.fullName}</Link>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {i.rating && <span className="inline-flex items-center gap-1"><RatingStars value={i.rating} size="h-3.5 w-3.5" />Your rating</span>}
                      {i.type === 'service' && <><Badge tone={STATUS[i.status][1]}>{STATUS[i.status][0]}</Badge><span className="font-medium text-slate-700">{money(i.amountCents)}</span></>}
                      {i.type === 'conversation' && <span className="text-slate-500">{i.messageCount} message{i.messageCount === 1 ? '' : 's'}</span>}
                    </div>
                    {i.summary && <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600 [overflow-wrap:anywhere]">{i.summary}</p>}
                  </div>
                  {i.type !== 'conversation' && <Button size="sm" variant="ghost" onClick={() => setChat(i.professional)}><MessageSquare className="h-3.5 w-3.5" />Contact</Button>}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
      {list.pagination && <Pagination page={list.pagination.page} totalPages={list.pagination.totalPages} onChange={(n) => update({ page: n > 1 ? n : '' }, true)} />}
      <StartChatModal open={!!chat} professional={chat} onClose={() => setChat(null)} />
    </div>
  );
}
