import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { ArrowLeft, Send, Trash2 } from 'lucide-react';
import { Avatar, Button, ConfirmDialog, ErrorState, Skeleton } from '../components/ui/index.js';
import { useToast } from '../context/ToastContext.jsx';
import { deleteThread, fetchThread, fetchThreadMessages, fetchUnread, markThreadRead, sendThreadMessage } from '../features/conversations/conversationsSlice.js';
import { fmtDateTime } from '../lib/format.js';

const MAX = 2000;

export default function ChatThread() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const { thread, messages, status, error } = useSelector((s) => s.conversations.active);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const bottom = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const t = await dispatch(fetchThread(id));
      if (!alive || t.error) return;
      await dispatch(fetchThreadMessages(id));
      if (t.payload.unreadCount > 0) { await dispatch(markThreadRead(id)); dispatch(fetchUnread()); }
    })();
    return () => { alive = false; };
  }, [dispatch, id]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const res = await dispatch(sendThreadMessage({ id, body }));
    setSending(false);
    if (res.error) return toast.error(res.payload?.details?.body?.[0] || res.payload?.message || 'Could not send');
    setText('');
  };
  const remove = async () => {
    setConfirm(false);
    const res = await dispatch(deleteThread(id));
    if (res.error) return toast.error(res.payload?.message);
    toast.info('Contact deleted.');
    navigate('/dashboard/contacts');
  };

  if (status === 'failed') return <div className="mx-auto max-w-3xl space-y-4"><Link to="/dashboard/contacts" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" />All contacts</Link><ErrorState message={error} /></div>;
  const pro = thread?.professional;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <Link to="/dashboard/contacts" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" />All contacts</Link>
      <section className="flex h-[calc(100vh-11rem)] min-h-[24rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-3 border-b border-slate-200 p-4">
          {pro ? <>
            <Avatar name={pro.fullName} src={pro.profileImage} size="h-11 w-11 text-sm" />
            <div className="min-w-0 flex-1"><Link to={`/professionals/${pro._id}`} className="block truncate font-semibold hover:text-brand-600">{pro.fullName}</Link><p className="truncate text-xs text-slate-500">{thread.subject || `${pro.title} · ${pro.location}`}</p></div>
            <button onClick={() => setConfirm(true)} aria-label="Delete contact" title="Delete contact" className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-5 w-5" /></button>
          </> : <Skeleton className="h-11 w-full" />}
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4" aria-live="polite" aria-label="Messages">
          {status === 'loading' && [0, 1, 2].map((i) => <Skeleton key={i} className={`h-12 ${i % 2 ? 'ml-auto w-2/3' : 'w-2/3'}`} />)}
          {messages.map((m) => (
            <div key={m._id} className={`flex ${m.senderType === 'visitor' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.senderType === 'visitor' ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'}`}>
                <p className="whitespace-pre-line [overflow-wrap:anywhere]">{m.body}</p>
                <p className={`mt-1 text-[11px] ${m.senderType === 'visitor' ? 'text-brand-100' : 'text-slate-400'}`}>{m.senderType === 'professional' && pro ? `${pro.fullName.split(' ')[0]} · ` : ''}{fmtDateTime(m.createdAt)}</p>
              </div>
            </div>
          ))}
          <div ref={bottom} />
        </div>

        <form onSubmit={send} className="border-t border-slate-200 p-3">
          <div className="flex items-end gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={MAX} aria-label="Write a message" placeholder="Write a message…"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="flex-1 resize-none rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <Button type="submit" loading={sending} disabled={!text.trim()}><Send className="h-4 w-4" />Send</Button>
          </div>
          <p className="mt-1 text-xs text-slate-400">The professional is emailed when you send a message and replies from their own inbox; you will get an email too. Demo: this proof of concept has no professional inbox, so replies shown here are sample data.</p>
        </form>
      </section>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} title="Delete this contact?" message="The chat with this professional and all of its messages will be deleted. This cannot be undone." />
    </div>
  );
}
