import { Link } from 'react-router-dom';
import { BadgeCheck, MapPin } from 'lucide-react';
import { Avatar, RatingStars } from '../../components/ui/index.js';

// Compact professional card reused by recently viewed, comparisons and "continue where you left off".
export default function ProfessionalMiniCard({ pro, children, actions, className = '' }) {
  return (
    <div className={`flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex gap-3">
        <Avatar name={pro.fullName} src={pro.profileImage} size="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1">
          <Link to={`/professionals/${pro._id}`} className="flex items-center gap-1 font-semibold text-slate-900 hover:text-brand-600">
            <span className="truncate">{pro.fullName}</span>
            {pro.verificationStatus === 'verified' && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-600" aria-label="Verified" />}
          </Link>
          <p className="truncate text-sm text-slate-600">{pro.title} · {pro.category}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><RatingStars value={pro.averageRating} size="h-3.5 w-3.5" /><strong className="text-slate-700">{pro.averageRating.toFixed(1)}</strong>({pro.reviewCount})</span>
            <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{pro.location}</span>
          </p>
        </div>
        {actions}
      </div>
      {children && <div className="mt-auto pt-3">{children}</div>}
    </div>
  );
}
