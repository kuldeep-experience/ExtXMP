import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { ClipboardList, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, ListSkeleton, Pagination, Select } from '../../components/ui/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { fmtDate } from '../../lib/format.js';
import ServiceRecordModal, { STATUS, money } from './ServiceRecordModal.jsx';
import { deleteServiceRecord, fetchServiceRecords } from './serviceRecordsSlice.js';

const PAGE_SIZE = 8;
const statuses = [{ value: '', label: 'Any status' }, ...Object.entries(STATUS).map(([value, [label]]) => ({ value, label }))];

export default function ServiceRecordsTab() {
  const dispatch = useDispatch();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) || '';
  const page = Number(params.get('page') || 1);
  const list = useSelector((s) => s.serviceRecords);
  const [search, setSearch] = useState(get('q'));
  const [modal, setModal] = useState({ open: false, record: null });
  const [removing, setRemoving] = useState(null);

  const update = useCallback((changes, keepPage = false) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!keepPage) next.delete('page');
    return next;
  }, { replace: true }), [setParams]);

  const query = { q: get('q'), status: get('status'), from: get('from'), to: get('to') };
  const load = useCallback(() => dispatch(fetchServiceRecords({ ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)), page, limit: PAGE_SIZE })), [dispatch, query.q, query.status, query.from, query.to, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => search !== get('q') && update({ q: search.trim() }), 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async () => {
    const r = removing; setRemoving(null);
    const res = await dispatch(deleteServiceRecord(r._id));
    res.error ? toast.error(res.payload?.message) : toast.info('Service record deleted.');
    load();
  };
  const filtered = Object.values(query).some(Boolean);
  const none = list.status === 'ready' && list.pagination?.total === 0 && !filtered;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{list.status === 'ready' && list.pagination?.total > 0 && <>Total tracked cost: <strong>{money(list.totalSpentCents)}</strong></>}</p>
        <Button onClick={() => setModal({ open: true, record: null })}><Plus className="h-4 w-4" />Add service record</Button>
      </div>
      {none ? (
        <EmptyState icon={ClipboardList} title="No service records yet" description="Keep a record of the services professionals performed for you, with dates, status and cost."
          action={<Button onClick={() => setModal({ open: true, record: null })}>Add a service record</Button>} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_10rem_10rem]">
            <Input icon={Search} placeholder="Search service, notes or professional" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search service records" />
            <Select aria-label="Status" value={get('status')} onChange={(e) => update({ status: e.target.value })} options={statuses} />
            <Input type="date" aria-label="From date" value={get('from')} onChange={(e) => update({ from: e.target.value })} />
            <Input type="date" aria-label="To date" value={get('to')} onChange={(e) => update({ to: e.target.value })} />
          </div>
          {list.status === 'loading' && <ListSkeleton count={3} className="grid gap-4 md:grid-cols-2" />}
          {list.status === 'failed' && <ErrorState message={`Could not load service records: ${list.error}`} onRetry={load} />}
          {list.status === 'ready' && list.items.length === 0 && <EmptyState title="No service records match these filters" action={<Button variant="secondary" onClick={() => { setSearch(''); setParams({ tab: 'records' }); }}>Clear filters</Button>} />}
          <div className={`grid gap-4 md:grid-cols-2 ${list.status === 'refreshing' ? 'opacity-60' : ''}`}>
            {list.items.map((r) => (
              <Card key={r._id} className="flex flex-col">
                <div className="flex items-start gap-3">
                  <Avatar name={r.professional.fullName} src={r.professional.profileImage} size="h-11 w-11 text-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{r.serviceName}</p>
                    <Link to={`/professionals/${r.professional._id}`} className="block truncate text-sm text-slate-600 hover:text-brand-600">{r.professional.fullName}</Link>
                  </div>
                  <div className="flex"><button onClick={() => setModal({ open: true, record: r })} aria-label={`Edit ${r.serviceName}`} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setRemoving(r)} aria-label={`Delete ${r.serviceName}`} className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
                  <span className="text-xs text-slate-500">{fmtDate(r.serviceDate)}</span>
                  <span className="ml-auto font-semibold">{money(r.amountCents)}</span>
                </div>
                {r.summary && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{r.summary}</p>}
                {r.experience && <p className="mt-2 text-xs text-slate-400">Linked to an experience</p>}
              </Card>
            ))}
          </div>
          {list.pagination && <Pagination page={list.pagination.page} totalPages={list.pagination.totalPages} onChange={(n) => update({ page: n > 1 ? n : '' }, true)} />}
        </>
      )}
      <ServiceRecordModal open={modal.open} record={modal.record} onClose={() => setModal({ open: false, record: null })} onSaved={load} />
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} title="Delete this service record?"
        message={removing && <p><strong>{removing.serviceName}</strong> by {removing.professional.fullName} will be deleted. This cannot be undone.</p>} />
    </div>
  );
}
