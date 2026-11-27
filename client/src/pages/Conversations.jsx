import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { MessageSquare, MessageSquarePlus, Pencil, Search, Sparkles, Trash2 } from 'lucide-react';
import { Avatar, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, ListSkeleton, Modal, PageHeader, Pagination } from '../components/ui/index.js';
import { useToast } from '../context/ToastContext.jsx';
import StartChatModal from '../features/conversations/StartChatModal.jsx';
import { deleteThread, fetchConversationList, fetchThreads, fetchUnread, removeConversation, renameConversation, selectConversations } from '../features/conversations/conversationsSlice.js';
import { fmtDateTime } from '../lib/format.js';

const PAGE_SIZE = 10;

function useListParams() {
  const [params, setParams] = useSearchParams();
  const update = useCallback((changes, keepPage = false) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!keepPage) next.delete('page');
    return next;
  }, { replace: true }), [setParams]);
  return { params, setParams, update };
}

// ---------------- contacts: professionals the visitor has contacted ----------------
function Contacts() {
  const dispatch = useDispatch();
  const toast = useToast();
  const { params, setParams, update } = useListParams();
  const q = params.get('q') || '';
  const page = Number(params.get('page') || 1);
  const list = useSelector((s) => s.conversations.threads);
  const [search, setSearch] = useState(q);
  const [removing, setRemoving] = useState(null);
  const [startOpen, setStartOpen] = useState(false);

  const load = useCallback(() => dispatch(fetchThreads({ ...(q && { q }), page, limit: PAGE_SIZE })), [dispatch, q, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => search !== q && update({ q: search.trim() }), 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async () => {
    const t = removing; setRemoving(null);
    const res = await dispatch(deleteThread(t._id));
    res.error ? toast.error(res.payload?.message) : toast.info('Contact deleted.');
    dispatch(fetchUnread());
    load();
  };
  const none = list.status === 'ready' && list.pagination?.total === 0 && !q;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><Input icon={Search} placeholder="Search by professional or message" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search contacts" /></div>
        <Button onClick={() => setStartOpen(true)}><MessageSquarePlus className="h-4 w-4" />Contact a professional</Button>
      </div>
      {none ? (
        <EmptyState icon={MessageSquare} title="No contacts yet" description="Contact a professional from their profile. They reply by email and in your chat." action={<Button onClick={() => setStartOpen(true)}>Contact a professional</Button>} />
      ) : (
        <>
          {list.status === 'loading' && <ListSkeleton count={3} className="grid gap-3" />}
          {list.status === 'failed' && <ErrorState message={`Could not load contacts: ${list.error}`} onRetry={load} />}
          {list.status === 'ready' && list.items.length === 0 && <EmptyState title={`No contacts match “${q}”`} action={<Button variant="secondary" onClick={() => { setSearch(''); setParams({}); }}>Clear search</Button>} />}
          <div className="space-y-3">
            {list.items.map((c) => (
              <Card key={c._id} className="flex flex-wrap items-center gap-3 !p-4">
                <Link to={`/dashboard/contacts/${c._id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={c.professional.fullName} src={c.professional.profileImage} size="h-12 w-12 text-base" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className={`truncate ${c.unreadCount ? 'font-bold' : 'font-medium'} text-slate-900`}>{c.professional.fullName}</span>
                      {c.unreadCount > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white" aria-label={`${c.unreadCount} unread`}>{c.unreadCount}</span>}</span>
                    <span className="block truncate text-xs text-slate-500">{c.subject ? `${c.subject} · ` : ''}{c.lastMessagePreview}</span>
                    <span className="block text-xs text-slate-400">{c.messageCount} message{c.messageCount === 1 ? '' : 's'} · {fmtDateTime(c.lastMessageAt)}</span>
                  </span>
                </Link>
                <button onClick={() => setRemoving(c)} aria-label={`Delete contact ${c.professional.fullName}`} title="Delete" className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </Card>
            ))}
          </div>
          {list.pagination && <Pagination page={list.pagination.page} totalPages={list.pagination.totalPages} onChange={(n) => update({ page: n > 1 ? n : '' }, true)} />}
        </>
      )}
      <StartChatModal open={startOpen} onClose={() => setStartOpen(false)} />
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} title="Delete this contact?"
        message={removing && <p>Your chat with <strong>{removing.professional.fullName}</strong> and all of its messages will be deleted.</p>} />
    </div>
  );
}

// ---------------- AI assistant conversations ----------------
function AiConversations() {
  const dispatch = useDispatch();
  const toast = useToast();
  const { params, setParams, update } = useListParams();
  const q = params.get('q') || '';
  const page = Number(params.get('page') || 1);
  const list = useSelector(selectConversations('main'));
  const [search, setSearch] = useState(q);
  const [renaming, setRenaming] = useState(null);
  const [title, setTitle] = useState('');
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => dispatch(fetchConversationList({ key: 'main', ...(q && { q }), page, limit: PAGE_SIZE })), [dispatch, q, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => search !== q && update({ q: search.trim() }), 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTitle = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const res = await dispatch(renameConversation({ id: renaming._id, title: title.trim() }));
    setBusy(false);
    if (res.error) return toast.error(res.payload?.details?.title?.[0] || res.payload?.message);
    toast.success('Conversation renamed'); setRenaming(null); load();
  };
  const remove = async () => {
    setBusy(true);
    const res = await dispatch(removeConversation(removing._id));
    setBusy(false); setRemoving(null);
    res.error ? toast.error(res.payload?.message) : toast.info('Conversation deleted.');
    load();
  };
  const none = list.status === 'succeeded' && list.pagination?.total === 0 && !q;
  return (
    <div className="space-y-4">
      {none ? (
        <EmptyState icon={Sparkles} title="No assistant conversations yet" description="Ask the assistant for a recommendation and your conversation will be saved here."
          action={<Link to="/dashboard/ai-assistant"><Button>Start a conversation</Button></Link>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1"><Input icon={Search} placeholder="Search assistant conversations" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search assistant conversations" /></div>
            <Link to="/dashboard/ai-assistant"><Button><MessageSquarePlus className="h-4 w-4" />New conversation</Button></Link>
          </div>
          {list.status === 'loading' && !list.items.length && <ListSkeleton count={3} className="grid gap-3" />}
          {list.status === 'failed' && <ErrorState message={`Could not load conversations: ${list.error}`} onRetry={load} />}
          {list.status === 'succeeded' && list.items.length === 0 && <EmptyState title={`No conversations match “${q}”`} action={<Button variant="secondary" onClick={() => { setSearch(''); setParams({}); }}>Clear search</Button>} />}
          <div className={`space-y-3 ${list.status === 'loading' ? 'opacity-60' : ''}`}>
            {list.items.map((c) => (
              <Card key={c._id} className="flex flex-wrap items-center gap-3 !p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Sparkles className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <Link to={`/dashboard/ai-assistant?c=${c._id}`} className="block truncate font-medium text-slate-900 hover:text-brand-600">{c.title}</Link>
                  <p className="text-xs text-slate-500">{c.messageCount / 2} question{c.messageCount === 2 ? '' : 's'} · last activity {fmtDateTime(c.lastMessageAt)}</p>
                </div>
                <Link to={`/dashboard/ai-assistant?c=${c._id}`}><Button size="sm" variant="secondary">Open</Button></Link>
                <button onClick={() => { setRenaming(c); setTitle(c.title); }} aria-label={`Rename ${c.title}`} title="Rename" className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setRemoving(c)} aria-label={`Delete ${c.title}`} title="Delete" className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </Card>
            ))}
          </div>
          {list.pagination && <Pagination page={list.pagination.page} totalPages={list.pagination.totalPages} onChange={(n) => update({ page: n > 1 ? n : '' }, true)} />}
        </>
      )}
      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename conversation"
        footer={<><Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button><Button type="submit" form="rename-form" loading={busy} disabled={!title.trim()}>Save</Button></>}>
        <form id="rename-form" onSubmit={saveTitle}><Input label="Title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></form>
      </Modal>
      <ConfirmDialog open={!!removing} busy={busy} onClose={() => setRemoving(null)} onConfirm={remove} title="Delete this conversation?"
        message={removing && <p><strong>{removing.title}</strong> and all of its messages and recommendations will be deleted. This cannot be undone.</p>} />
    </div>
  );
}

export default function Conversations() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'ai' ? 'ai' : 'professionals';
  const unread = useSelector((s) => s.conversations.unread);
  const tabBtn = (id, label, badge) => (
    <button key={id} role="tab" aria-selected={tab === id} onClick={() => setParams(id === 'ai' ? { tab: 'ai' } : {})}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${tab === id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
      {label}{badge > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">{badge}</span>}
    </button>
  );
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader icon={MessageSquare} title="My Contacts" description="Professionals you have contacted and your chats with them, plus your past conversations with the AI Recommendation Assistant." />
      <div role="tablist" aria-label="Contact type" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">{tabBtn('professionals', 'Contacts', unread)}{tabBtn('ai', 'AI assistant', 0)}</div>
      {tab === 'ai' ? <AiConversations /> : <Contacts />}
    </div>
  );
}
