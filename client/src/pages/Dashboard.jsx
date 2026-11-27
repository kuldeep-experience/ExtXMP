import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Bookmark, Clock, History, MailWarning, MessageSquare, Search, Sparkles, Eye, ClipboardPen } from 'lucide-react';
import { Avatar, Badge, Button, Card, DevMailboxHint, EmptyState, ErrorState, Input, ListSkeleton, PageHeader, Skeleton, StatCard } from '../components/ui/index.js';
import { resendVerification } from '../features/auth/authSlice.js';
import { fetchConversationList, fetchThreads, selectConversations } from '../features/conversations/conversationsSlice.js';
import { fetchExperiences, selectExperiences } from '../features/experience/experienceSlice.js';
import { fetchViewed } from '../features/history/historySlice.js';
import ProfessionalMiniCard from '../features/history/ProfessionalMiniCard.jsx';
import { fetchSaved } from '../features/saved/savedSlice.js';
import { useToast } from '../context/ToastContext.jsx';
import { fmtDate, fmtDateTime, greeting } from '../lib/format.js';

const AI_PROMPTS = ['Find a financial advisor in Charlotte', 'I need a mortgage professional with 5+ years of experience', 'Highly rated insurance professionals in Ohio'];

function Section({ title, to, linkLabel = 'View all', children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2>{to && <Link to={to} className="text-sm font-medium text-brand-600 hover:underline">{linkLabel}</Link>}</div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const user = useSelector((s) => s.auth.user);
  const contacts = useSelector((s) => s.conversations.threads);
  const saved = useSelector((s) => s.saved.list);
  const viewed = useSelector((s) => s.history.viewed);
  const convs = useSelector(selectConversations('overview'));
  const experiences = useSelector(selectExperiences('overview'));
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [ask, setAsk] = useState('');

  const load = useCallback(() => {
    dispatch(fetchThreads({ limit: 3 }));
    dispatch(fetchSaved({ sort: 'recent', limit: 4 }));
    dispatch(fetchViewed({ limit: 4 }));
    dispatch(fetchConversationList({ key: 'overview', limit: 3 }));
    dispatch(fetchExperiences({ key: 'overview', limit: 3 }));
  }, [dispatch]);
  useEffect(() => { load(); }, [load]);

  const resend = async () => {
    const res = await dispatch(resendVerification());
    resendVerification.fulfilled.match(res) ? toast.success(res.payload) : toast.error(res.payload?.message);
  };
  const search = (e) => { e.preventDefault(); navigate(`/professionals?${new URLSearchParams({ ...(q.trim() && { q: q.trim() }), ...(location.trim() && { location: location.trim() }) })}`); };
  const sendAsk = (text) => text.trim() && navigate(`/dashboard/ai-assistant?ask=${encodeURIComponent(text.trim())}`);

  // Recent interactions: the newest things the visitor did, merged from their real records.
  const interactions = useMemo(() => [
    ...viewed.items.map((v) => ({ id: `v${v._id}`, at: v.lastViewedAt, icon: Eye, text: <>Viewed <strong>{v.professional.fullName}</strong></>, to: `/professionals/${v.professional._id}` })),
    ...saved.items.map((s) => ({ id: `s${s._id}`, at: s.savedAt, icon: Bookmark, text: <>Saved <strong>{s.professional.fullName}</strong></>, to: '/dashboard/saved' })),
    ...contacts.items.map((c) => ({ id: `m${c._id}`, at: c.lastMessageAt, icon: MessageSquare, text: <>Contacted <strong>{c.professional.fullName}</strong></>, to: `/dashboard/contacts/${c._id}` })),
    ...convs.items.map((c) => ({ id: `c${c._id}`, at: c.lastMessageAt, icon: MessageSquare, text: <>Asked the assistant: <strong>{c.title}</strong></>, to: `/dashboard/ai-assistant?c=${c._id}` })),
    ...experiences.items.map((e) => ({ id: `e${e._id}`, at: e.createdAt, icon: ClipboardPen, text: <>Logged an experience with <strong>{e.professional.fullName}</strong></>, to: '/dashboard/experience-history' })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8), [viewed.items, saved.items, contacts.items, convs.items, experiences.items]);

  const loading = [contacts.status === 'ready' ? 'succeeded' : contacts.status, saved.status, viewed.status, convs.status, experiences.status].some((s) => s === 'idle' || s === 'loading');

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader title={`${greeting()}, ${user.firstName}`} description="Here is what is happening with your professional search." />

      {!user.emailVerified && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-amber-900"><MailWarning className="h-5 w-5 shrink-0" />Please verify <strong>{user.email}</strong> to secure your account.</p>
            <Button size="sm" variant="secondary" onClick={resend}>Resend verification email</Button>
          </div>
          <DevMailboxHint email={user.email} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Quick search">
          <form className="space-y-3" onSubmit={search}>
            <Input icon={Search} placeholder="Name, title or specialty" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search professionals" />
            <Input placeholder="City or state (optional)" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
            <Button type="submit" className="w-full">Search professionals</Button>
          </form>
        </Card>
        <Card className="border-brand-100 bg-gradient-to-br from-brand-50 to-white" title="Ask the AI assistant" action={<Sparkles className="h-5 w-5 text-brand-600" />}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); sendAsk(ask); }}>
            <Input placeholder="Describe the professional you need" value={ask} onChange={(e) => setAsk(e.target.value)} aria-label="Ask the assistant" maxLength={1000} />
            <div className="flex flex-wrap gap-1.5">{AI_PROMPTS.map((p) => <button type="button" key={p} onClick={() => sendAsk(p)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-brand-500 hover:text-brand-700">{p}</button>)}</div>
            <Button type="submit" className="w-full" disabled={!ask.trim()}>Get recommendations</Button>
          </form>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={Bookmark} label="Saved professionals" to="/dashboard/saved" loading={saved.status !== 'succeeded'} value={saved.pagination?.total ?? 0} />
        <StatCard icon={MessageSquare} label="Professionals contacted" to="/dashboard/contacts" loading={contacts.status !== 'ready'} value={contacts.pagination?.total ?? 0} />
        <StatCard icon={History} label="Experiences logged" to="/dashboard/experience-history" loading={experiences.status !== 'succeeded'} value={experiences.pagination?.total ?? 0} />
        <StatCard icon={Sparkles} label="Assistant chats" to="/dashboard/contacts?tab=ai" loading={convs.status !== 'succeeded'} value={convs.pagination?.total ?? 0} />
        <StatCard icon={Clock} label="Recently viewed" to="/dashboard/recently-viewed" loading={viewed.status !== 'ready'} value={viewed.pagination?.total ?? 0} />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="min-w-0 space-y-8 lg:col-span-2">
          <Section title="Recent contacts" to="/dashboard/contacts">
            {contacts.status === 'failed' ? <ErrorState message={contacts.error} onRetry={load} /> : !['ready', 'refreshing'].includes(contacts.status) ? <Skeleton className="h-28" /> : contacts.items.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No contacts yet" description="Contact a professional from their profile and chat with them here." action={<Link to="/professionals"><Button size="sm">Find a professional</Button></Link>} />
            ) : (
              <div className="space-y-3">{contacts.items.map((c) => (
                <Card key={c._id} className="flex flex-wrap items-center gap-3">
                  <Avatar name={c.professional.fullName} src={c.professional.profileImage} size="h-11 w-11 text-sm" />
                  <div className="min-w-0 flex-1"><Link to={`/dashboard/contacts/${c._id}`} className="block truncate font-medium hover:text-brand-600">{c.professional.fullName}</Link><p className="truncate text-xs text-slate-500">{c.lastMessagePreview}</p></div>
                  <div className="text-right text-xs text-slate-500">{fmtDateTime(c.lastMessageAt)}{c.unreadCount > 0 && <Badge tone="blue">{c.unreadCount} new</Badge>}</div>
                </Card>
              ))}</div>
            )}
          </Section>

          <Section title="Recently viewed" to="/dashboard/recently-viewed">
            {viewed.status === 'failed' ? <ErrorState message={viewed.error} onRetry={load} /> : viewed.status !== 'ready' && viewed.status !== 'refreshing' ? <ListSkeleton count={2} className="grid gap-4 sm:grid-cols-2" /> : viewed.items.length === 0 ? (
              <EmptyState icon={Clock} title="Nothing viewed yet" description="Professionals you open will show up here." action={<Link to="/professionals"><Button size="sm">Browse professionals</Button></Link>} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">{viewed.items.map((v) => <ProfessionalMiniCard key={v._id} pro={v.professional}><p className="text-xs text-slate-500">Last viewed {fmtDate(v.lastViewedAt)}</p></ProfessionalMiniCard>)}</div>
            )}
          </Section>

          <Section title="Saved professionals" to="/dashboard/saved">
            {saved.status === 'failed' ? <ErrorState message={saved.error} onRetry={load} /> : saved.status !== 'succeeded' ? <ListSkeleton count={2} className="grid gap-4 sm:grid-cols-2" /> : saved.items.length === 0 ? (
              <EmptyState icon={Bookmark} title="No saved professionals" description="Tap the bookmark on a professional to keep them here." action={<Link to="/professionals"><Button size="sm">Find professionals</Button></Link>} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">{saved.items.map((s) => <ProfessionalMiniCard key={s._id} pro={s.professional}><p className="text-xs text-slate-500">Saved {fmtDate(s.savedAt)}{s.note && ' · has a note'}</p></ProfessionalMiniCard>)}</div>
            )}
          </Section>
        </div>

        <Section title="Recent interactions">
          <Card>
            {loading ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div> : interactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Your activity will appear here.</p>
            ) : (
              <ol className="space-y-4">{interactions.map(({ id, at, icon: Icon, text, to }) => (
                <li key={id}><Link to={to} className="flex gap-3 rounded-lg hover:bg-slate-50">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 text-sm"><span className="block text-slate-700 [overflow-wrap:anywhere]">{text}</span><span className="text-xs text-slate-500">{fmtDateTime(at)}</span></span>
                </Link></li>
              ))}</ol>
            )}
          </Card>
        </Section>
      </div>
    </div>
  );
}
