import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Bot, ChevronDown, FlaskConical, Minus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge, Button, Card, Loader } from '../../components/ui/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { selectIsAuthenticated } from '../auth/authSlice.js';
import SourceReviews from './SourceReviews.jsx';
import { fetchInsight, generateInsight } from './insightsSlice.js';

const SECTIONS = [
  ['positiveFeedback', 'Common positive feedback', 'What reviewers liked', true],
  ['strengths', 'Frequently mentioned strengths', 'Qualities reviewers describe', false],
  ['concerns', 'Common concerns', 'What reviewers were less happy about', true],
  ['recentTrends', 'Recent review trends', 'How recent reviews compare with earlier ones', false],
  ['services', 'Frequently mentioned services', 'Services reviewers say they used', false],
  ['experienceThemes', 'Customer experience themes', 'Topics that come up across reviews', false],
];
const COMMONALITY = { common: ['Common theme', 'blue'], occasional: ['Mentioned by a few', 'gray'], isolated: ['Single review', 'amber'] };
const SENTIMENT = { positive: ['Mostly positive', 'green'], mixed: ['Mixed', 'amber'], 'mostly negative': ['Mostly critical', 'red'] };
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const TrendIcon = { up: TrendingUp, down: TrendingDown, steady: Minus, info: Minus };

function Item({ item, section, total, professionalId, reviewsHref }) {
  const [open, setOpen] = useState(false);
  const n = item.sourceReviewIds.length;
  const trend = section === 'recentTrends';
  const Icon = trend ? TrendIcon[item.direction] || Minus : null;
  const [commLabel, commTone] = COMMONALITY[item.commonality] || [];
  const [sentLabel, sentTone] = SENTIMENT[item.sentiment] || [];
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        {Icon && <Icon className={`h-4 w-4 ${item.direction === 'up' ? 'text-emerald-600' : item.direction === 'down' ? 'text-amber-600' : 'text-slate-400'}`} />}
        <span className="font-medium text-slate-900">{item.label}</span>
        {!trend && commLabel && section !== 'services' && <Badge tone={commTone}>{commLabel}</Badge>}
        {sentLabel && <Badge tone={sentTone}>{sentLabel}</Badge>}
        {!trend && <span className="text-xs text-slate-500">{item.count} of {total} reviews</span>}
      </div>
      {item.detail && <p className="mt-1 text-sm text-slate-600">{item.detail}</p>}
      {item.quote && <blockquote className="mt-1 border-l-2 border-slate-200 pl-3 text-sm italic text-slate-600">“{item.quote.text}”</blockquote>}
      {n > 0 && (
        <button className="mt-1.5 text-xs font-medium text-brand-600 hover:underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'View'} {n} supporting review{n === 1 ? '' : 's'}
        </button>
      )}
      {open && <SourceReviews professionalId={professionalId} ids={item.sourceReviewIds} highlightId={item.quote?.reviewId} reviewsHref={reviewsHref} />}
    </li>
  );
}

function Section({ id, title, subtitle, items, defaultOpen, total, professionalId, reviewsHref }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `insight-${id}`;
  return (
    <section className="border-t border-slate-100">
      <button className="flex w-full items-center justify-between gap-3 py-3 text-left" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <span><span className="font-semibold text-slate-900">{title}</span><span className="ml-2 text-xs text-slate-500">{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'None found'}</span><span className="block text-xs text-slate-500">{subtitle}</span></span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={panelId} className="pb-4">
          {items.length === 0 ? <p className="text-sm text-slate-500">Nothing in the reviews points to this.</p>
            : <ul className="divide-y divide-slate-100">{items.map((it) => <Item key={`${it.label}`} item={it} section={id} total={total} professionalId={professionalId} reviewsHref={reviewsHref} />)}</ul>}
        </div>
      )}
    </section>
  );
}

// Review insights for one professional: cached on the server, generated in the background when missing or out of date.
export default function InsightsPanel({ professionalId, reviewsHref = '#reviews', pollMs = 1500 }) {
  const dispatch = useDispatch();
  const authed = useSelector(selectIsAuthenticated);
  const toast = useToast();
  const entry = useSelector((st) => st.insights.byProfessional[professionalId]);
  const [updating, setUpdating] = useState(false);
  const polls = useRef(0);

  const load = useCallback(() => dispatch(fetchInsight(professionalId)), [dispatch, professionalId]);
  useEffect(() => { polls.current = 0; load(); }, [load]);
  // poll while the first generation (or a refresh) is running
  useEffect(() => {
    const busy = entry?.status === 'generating' || entry?.body?.regenerating;
    if (!busy || polls.current >= 10) return undefined;
    const t = setTimeout(() => { polls.current += 1; load(); }, pollMs);
    return () => clearTimeout(t);
  }, [entry, load, pollMs]);

  const regenerate = async () => {
    setUpdating(true);
    try {
      const { body } = await dispatch(generateInsight(professionalId)).unwrap();
      body.generated ? toast.success(body.message) : toast.info(body.message);
    } catch (e) { toast.error(e?.message || 'Could not update insights'); } finally { setUpdating(false); }
  };

  const status = entry?.status ?? 'loading';
  const payload = entry?.body;
  const state = { error: entry?.error };

  if (status === 'loading') return <Card title="Review insights"><Loader label="Loading review insights…" /></Card>;
  if (status === 'error') return <Card title="Review insights"><p className="text-sm text-red-600">Could not load review insights: {state.error}</p><Button className="mt-3" size="sm" variant="secondary" onClick={load}>Try again</Button></Card>;
  if (status === 'insufficient') return <Card title="Review insights"><p className="text-sm text-slate-600">There are not enough reviews yet to summarize ({payload.reviewsAvailable} of {payload.minReviews} needed).</p></Card>;
  if (status === 'failed') return <Card title="Review insights"><p className="text-sm text-slate-600">{payload.error || 'Insights are not available right now.'}</p><Button className="mt-3" size="sm" variant="secondary" onClick={load}>Check again</Button></Card>;
  if (status === 'generating') return <Card title="Review insights"><Loader label="Analyzing reviews…" /></Card>;

  const d = payload.data;
  const f = payload.freshness;
  const demo = payload.mode === 'demo';
  return (
    <Card title="Review insights" action={demo ? <Badge tone="amber">Demo analyzer</Badge> : <Badge tone="blue">AI-generated</Badge>}>
      <div className={`mb-4 flex items-start gap-2 rounded-xl p-3 text-xs ${demo ? 'bg-amber-50 text-amber-900' : 'bg-brand-50 text-brand-900'}`}>
        {demo ? <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" /> : <Bot className="mt-0.5 h-4 w-4 shrink-0" />}
        <p>
          {demo ? 'Demo insights: a keyword-based analyzer read the real reviews below. No AI model was used.' : `AI-generated from the real reviews below (${payload.label}${payload.model ? `, ${payload.model}` : ''}). It can contain mistakes.`}
          {' '}These summarize what reviewers said. They are opinions, not verified facts about the professional.
          {payload.note && <strong className="block pt-1">{payload.note}</strong>}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-slate-800">{d.summary.text}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>Based on {d.reviewsAnalyzed} reviews</span><span aria-hidden>·</span>
        <span>Last updated {fmtDate(d.updatedAt)}</span>
        {payload.regenerating && <span className="inline-flex items-center gap-1 text-brand-600"><RefreshCw className="h-3 w-3 animate-spin" />Refreshing…</span>}
      </p>
      {f.newReviews > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {f.newReviews} new review{f.newReviews === 1 ? '' : 's'} since these insights were generated.
          {f.needsRegeneration
            ? (authed ? <Button size="sm" variant="secondary" onClick={regenerate} loading={updating}><RefreshCw className="h-3.5 w-3.5" />Update insights</Button> : ' They will be refreshed soon.')
            : ` They update after ${f.minNewReviews} new reviews.`}
        </p>
      )}

      <div className="mt-4">
        {SECTIONS.map(([key, title, subtitle, open]) => (
          <Section key={key} id={key} title={title} subtitle={subtitle} items={d[key]} defaultOpen={open} total={d.reviewsAnalyzed} professionalId={d.professional} reviewsHref={reviewsHref} />
        ))}
      </div>
    </Card>
  );
}
