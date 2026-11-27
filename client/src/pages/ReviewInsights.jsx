import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Bookmark, FlaskConical, Lightbulb } from 'lucide-react';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, ListSkeleton, PageHeader, RatingStars } from '../components/ui/index.js';
import InsightsPanel from '../features/insights/InsightsPanel.jsx';
import { fetchMyInsights } from '../features/insights/insightsSlice.js';
import { fmtDate } from '../lib/format.js';

function Row({ row, open, onToggle }) {
  const p = row.professional;
  const i = row.insight;
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        <Avatar name={p.fullName} src={p.profileImage} size="h-14 w-14 text-lg" />
        <div className="min-w-0 flex-1">
          <Link to={`/professionals/${p._id}`} className="font-semibold text-slate-900 hover:text-brand-600">{p.fullName}</Link>
          <p className="text-sm text-slate-600">{p.title} · {p.category}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm"><RatingStars value={p.averageRating} /><strong>{p.averageRating.toFixed(1)}</strong><span className="text-slate-500">({p.reviewCount} reviews)</span></p>
        </div>
        {row.status === 'ready' && <Button variant="secondary" size="sm" onClick={onToggle} aria-expanded={open}>{open ? 'Hide full insights' : 'Show full insights'}</Button>}
      </div>
      {row.status === 'generating' && <p className="mt-3 text-sm text-slate-500">Analyzing reviews…</p>}
      {row.status === 'failed' && <p className="mt-3 text-sm text-slate-600">Insights are not available right now.</p>}
      {row.status === 'insufficient' && <p className="mt-3 text-sm text-slate-600">Not enough reviews yet to summarize ({row.reviewsAvailable} of 5 needed).</p>}
      {i && (
        <div className="mt-3 space-y-2">
          <p className="line-clamp-3 text-sm text-slate-700">{i.summaryText}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {i.topStrengths.map((s) => <Badge key={s} tone="green">{s}</Badge>)}
            {i.topConcern && <Badge tone="amber">Concern: {i.topConcern}</Badge>}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
            <span>Based on {i.reviewsAnalyzed} reviews</span><span>Updated {fmtDate(i.generatedAt)}</span>
            {i.mode === 'demo' && <span className="inline-flex items-center gap-1 text-amber-700"><FlaskConical className="h-3 w-3" />{i.label}</span>}
          </p>
        </div>
      )}
      {open && <div className="mt-4"><InsightsPanel professionalId={p._id} reviewsHref={`/professionals/${p._id}#reviews`} /></div>}
    </Card>
  );
}

export default function ReviewInsights() {
  const dispatch = useDispatch();
  const { rows, status, error } = useSelector((s) => s.insights.mine);
  const [openId, setOpenId] = useState(null);
  const polls = useRef(0);
  const load = useCallback(() => dispatch(fetchMyInsights()), [dispatch]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!rows.some((r) => r.status === 'generating') || polls.current >= 10) return undefined;
    const t = setTimeout(() => { polls.current += 1; load(); }, 1500);
    return () => clearTimeout(t);
  }, [rows, load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader icon={Lightbulb} title="Review Insights" description="What reviewers say about the professionals you saved. Summaries are built from real, approved reviews and are opinions, not verified facts." />
      {status === 'loading' && <ListSkeleton count={2} className="grid gap-4" />}
      {status === 'failed' && <ErrorState message={`Could not load insights: ${error}`} onRetry={load} />}
      {status === 'ready' && rows.length === 0 && (
        <EmptyState icon={Bookmark} title="Save professionals to see their review insights" description="Insights for the professionals in My Saved Professionals appear here. You can also open any profile to see its insights."
          action={<Link to="/professionals"><Button>Browse professionals</Button></Link>} />
      )}
      <div className="space-y-4">{rows.map((r) => <Row key={r.professional._id} row={r} open={openId === r.professional._id} onToggle={() => setOpenId(openId === r.professional._id ? null : r.professional._id)} />)}</div>
    </div>
  );
}
