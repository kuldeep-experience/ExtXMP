import { Bot, FlaskConical } from 'lucide-react';
import { Badge } from '../../components/ui/index.js';
import RecommendationCard from './RecommendationCard.jsx';

const title = (slug) => slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export function criteriaChips(c) {
  const chips = [];
  if (c.category) chips.push(title(c.category));
  if (c.location) chips.push(c.location);
  if (c.nearMe) chips.push('Near me');
  if (c.minExperience != null) chips.push(`${c.minExperience}+ years`);
  if (c.minRating != null) chips.push(`Rated ${c.minRating}+`);
  [...(c.specializations || []), ...(c.services || [])].forEach((x) => chips.push(x));
  (c.topics || []).forEach((x) => chips.push(`“${x}”`));
  if (c.verifiedOnly) chips.push('Verified only');
  return chips;
}

export default function ChatMessage({ message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className={`max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm text-white ${message.pending ? 'opacity-60' : ''}`}>{message.content}</p>
      </div>
    );
  }
  const s = message.search;
  const chips = s ? criteriaChips(s.criteria) : [];
  return (
    <div className="flex gap-3">
      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white"><Bot className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="max-w-3xl rounded-2xl rounded-tl-md bg-white p-4 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200">
          <p className="whitespace-pre-line">{message.content}</p>
          {chips.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">What I understood</p>
              <div className="flex flex-wrap gap-1.5">{chips.map((c) => <Badge key={c} tone={c.startsWith('“') ? 'amber' : 'blue'}>{c}</Badge>)}</div>
            </div>
          )}
          {s?.mode === 'demo' && <p className="mt-3 flex items-center gap-1 text-xs text-amber-700"><FlaskConical className="h-3.5 w-3.5" />Demo mode: understood with built-in keyword rules, not an AI model.</p>}
        </div>
        {s?.recommendations.length > 0 && (
          <div className="grid gap-4 2xl:grid-cols-2">
            {s.recommendations.map((r, i) => <RecommendationCard key={r.professional._id} rec={r} rank={i + 1} />)}
          </div>
        )}
      </div>
    </div>
  );
}
