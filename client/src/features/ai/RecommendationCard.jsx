import { Link } from 'react-router-dom';
import { BadgeCheck, Briefcase, Check, MapPin, TriangleAlert } from 'lucide-react';
import { Avatar, Badge, Card, RatingStars } from '../../components/ui/index.js';
import BookmarkButton from '../saved/BookmarkButton.jsx';

export default function RecommendationCard({ rec, rank }) {
  const p = rec.professional;
  return (
    <Card className="flex h-full flex-col">
      <div className="flex gap-3">
        <div className="relative">
          <Avatar name={p.fullName} src={p.profileImage} size="h-14 w-14 text-lg" />
          <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white" aria-label={`Rank ${rank}`}>{rank}</span>
        </div>
        <div className="min-w-0 flex-1">
          <Link to={`/professionals/${p._id}`} className="flex items-center gap-1 font-semibold text-slate-900 hover:text-brand-600">
            <span className="truncate">{p.fullName}</span>
            {p.verificationStatus === 'verified' && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-600" aria-label="Verified in the directory" />}
          </Link>
          <p className="truncate text-sm text-slate-600">{p.title}</p>
          <Badge tone="blue">{p.category}</Badge>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5"><RatingStars value={p.averageRating} /><strong>{p.averageRating.toFixed(1)}</strong><span className="text-slate-500">({p.reviewCount} reviews)</span></span>
        <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{p.location}</span>
        <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" />{p.yearsOfExperience} yrs experience</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">{rec.relevantSpecializations.map((s) => <Badge key={s} tone="gray">{s}</Badge>)}</div>

      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Why this match</p>
        {rec.aiExplanation && <p className="mb-2 text-slate-800">{rec.aiExplanation} <span className="text-xs text-slate-400">(AI wording)</span></p>}
        <ul className="space-y-1">
          {rec.matched.map((m) => <li key={m} className="flex gap-1.5 text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{m}</li>)}
          {rec.unmet.map((m) => <li key={m} className="flex gap-1.5 text-amber-800"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{m}</li>)}
        </ul>
        <p className="mt-2 text-xs text-slate-400">Match score {rec.score} / 100, calculated from directory data.</p>
      </div>

      <div className="mt-auto flex gap-2 pt-4">
        <Link to={`/professionals/${p._id}`} className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-brand-700">View profile</Link>
        <BookmarkButton professionalId={p._id} variant="button" />
      </div>
    </Card>
  );
}
