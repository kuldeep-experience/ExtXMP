import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Bot, FlaskConical, History, LocateFixed, MessageSquarePlus, Send, Sparkles } from 'lucide-react';
import { Button, Card, Loader } from '../components/ui/index.js';
import { useToast } from '../context/ToastContext.jsx';
import ChatMessage from '../features/ai/ChatMessage.jsx';
import { clearSendError, fetchAiStatus, fetchConversations, fetchMessages, newConversation, selectConversation, sendMessage } from '../features/ai/aiSlice.js';

const EXAMPLES = [
  'I need a real estate agent experienced in helping first-time home buyers.',
  'Find a financial advisor in Charlotte.',
  'I need a mortgage professional with at least 5 years of experience.',
  'Find highly rated insurance professionals near my location.',
  'I need someone specializing in commercial property.',
];
const REFINE = [
  ['10+ years of experience', 'Only show professionals with at least 10 years of experience.'],
  ['Rated 4.5 or higher', 'Rated 4.5 or higher please.'],
  ['Verified only', 'Only verified professionals.'],
  ['Start over', 'Start over.'],
];
const MAX = 1000;

export default function AiAssistant() {
  const dispatch = useDispatch();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const urlId = params.get('c');
  const { mode, conversations, active, sending, sendError } = useSelector((s) => s.ai);
  const [text, setText] = useState('');
  const [coords, setCoords] = useState(null);
  const [showList, setShowList] = useState(false);
  const bottom = useRef(null);
  const asked = useRef(false);

  useEffect(() => { dispatch(fetchAiStatus()); dispatch(fetchConversations()); }, [dispatch]);
  useEffect(() => {
    if (urlId && urlId !== active.id) { dispatch(selectConversation(urlId)); dispatch(fetchMessages(urlId)); }
    if (!urlId && active.id) dispatch(newConversation());
  }, [urlId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [active.messages.length, sending]);
  useEffect(() => { if (sendError) { setText((t) => t || sendError.text); toast.error(sendError.message); dispatch(clearSendError()); } }, [sendError]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (message) => {
    const clean = message.trim();
    if (!clean || sending) return;
    setText('');
    const res = await dispatch(sendMessage({ message: clean, conversationId: active.id || undefined, ...(coords && { location: coords }) }));
    if (sendMessage.fulfilled.match(res) && !urlId) setParams({ c: res.payload.conversation._id }, { replace: true });
  };

  // The dashboard shortcut opens the assistant with a question already asked.
  const ask = params.get('ask');
  useEffect(() => {
    if (!ask || asked.current || urlId) return;
    asked.current = true;
    setParams({}, { replace: true });
    send(ask);
  }, [ask]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLocation = () => {
    if (coords) return setCoords(null);
    if (!navigator.geolocation) return toast.error('Your browser does not support location.');
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: +p.coords.latitude.toFixed(4), lng: +p.coords.longitude.toFixed(4) }); toast.success('Location on. It is only used to filter results and is not stored.'); },
      () => toast.error('Could not get your location. You can name a city instead.'),
    );
  };

  const open = (id) => { setShowList(false); setParams(id ? { c: id } : {}); };
  const lastAssistant = [...active.messages].reverse().find((m) => m.role === 'assistant');
  const canRefine = !sending && lastAssistant?.search && ['results', 'empty'].includes(lastAssistant.search.outcome);
  const fmt = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const list = (
    <div className="space-y-1">
      <Button className="mb-2 w-full" variant="secondary" onClick={() => open(null)}><MessageSquarePlus className="h-4 w-4" />New conversation</Button>
      {conversations.status === 'loading' && !conversations.items.length && <Loader label="Loading…" />}
      {conversations.status === 'ready' && !conversations.items.length && <p className="px-2 py-4 text-sm text-slate-500">No previous conversations yet.</p>}
      {conversations.items.map((c) => (
        <button key={c._id} onClick={() => open(c._id)} aria-current={c._id === active.id ? 'true' : undefined}
          className={`block w-full rounded-xl px-3 py-2 text-left ${c._id === active.id ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'}`}>
          <span className="line-clamp-2 text-sm font-medium">{c.title}</span>
          <span className="text-xs text-slate-500">{fmt(c.lastMessageAt)} · {c.messageCount / 2} {c.messageCount === 2 ? 'question' : 'questions'}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Sparkles className="h-6 w-6 text-brand-600" />AI Recommendation Assistant</h1>
          <p className="mt-1 text-sm text-slate-500">Describe the professional you need. Recommendations come from the real directory.</p>
        </div>
        <Button variant="secondary" className="lg:hidden" onClick={() => setShowList((v) => !v)}><History className="h-4 w-4" />Conversations</Button>
      </div>

      {mode.mode === 'demo' && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><FlaskConical className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Demo mode.</strong> No AI model is connected, so your request is understood with built-in keyword rules. The professionals, ratings and ranking are still real: they come from the database and a fixed scoring formula.</span></p>
      )}
      {mode.mode === 'live' && (
        <p className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900"><Bot className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{mode.label}</strong>{mode.model ? ` (${mode.model})` : ''}. The model interprets your request, asks follow-up questions when it needs more detail, and rewords explanations. Professionals, ratings and ranking always come from the database.</span></p>
      )}

      <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
        <aside className={`${showList ? 'block' : 'hidden'} lg:block`}><Card title="Conversations" className="lg:sticky lg:top-4">{list}</Card></aside>

        <section className="flex min-h-[28rem] flex-col rounded-2xl border border-slate-200 bg-slate-50 lg:h-[calc(100vh-14rem)]">
          <div className="flex-1 space-y-5 overflow-y-auto p-4" aria-live="polite">
            {active.status === 'loading' && <Loader label="Loading conversation…" />}
            {active.status === 'failed' && <p className="text-center text-sm text-red-600">Could not load this conversation: {active.error}</p>}
            {active.status !== 'loading' && active.messages.length === 0 && (
              <div className="mx-auto max-w-2xl py-8 text-center">
                <Bot className="mx-auto h-10 w-10 text-brand-600" />
                <h2 className="mt-3 text-lg font-semibold">What kind of professional are you looking for?</h2>
                <p className="mt-1 text-sm text-slate-500">Tell me the category, where, and what matters: experience, rating, specialty.</p>
                <div className="mt-5 flex flex-col gap-2">
                  {EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} disabled={sending} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm text-slate-700 hover:border-brand-500 hover:text-brand-700 disabled:opacity-60">{e}</button>)}
                </div>
              </div>
            )}
            {active.messages.map((m) => <ChatMessage key={m._id} message={m} />)}
            {sending && (
              <div className="flex items-center gap-3 text-sm text-slate-500" role="status">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white"><Bot className="h-4 w-4" /></span>
                <span className="inline-flex gap-1" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
                Searching the directory…
              </div>
            )}
            <div ref={bottom} />
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            {canRefine && (
              <div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">Refine:</span>
                {REFINE.map(([label, msg]) => <button key={label} onClick={() => send(msg)} className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:border-brand-500 hover:text-brand-700">{label}</button>)}
              </div>
            )}
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <button type="button" onClick={toggleLocation} aria-pressed={!!coords} title={coords ? 'Location on. Click to turn off' : 'Use my location for “near me” requests'}
                className={`rounded-xl border p-2.5 ${coords ? 'border-brand-600 bg-brand-50 text-brand-600' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}><LocateFixed className="h-5 w-5" /><span className="sr-only">Use my location</span></button>
              <div className="flex-1">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={MAX} placeholder="e.g. I need a mortgage professional with at least 5 years of experience"
                  aria-label="Message the assistant" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
                  className="w-full resize-none rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <Button type="submit" loading={sending} disabled={!text.trim()}><Send className="h-4 w-4" />Send</Button>
            </form>
            <p className="mt-1 text-xs text-slate-400">Enter to send, Shift+Enter for a new line. {text.length}/{MAX}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
