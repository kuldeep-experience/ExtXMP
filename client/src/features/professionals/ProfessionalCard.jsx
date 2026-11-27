import { Link } from 'react-router-dom';
import { BadgeCheck, Briefcase, MapPin } from 'lucide-react';
import { Avatar, Badge, RatingStars } from '../../components/ui/index.js';
import BookmarkButton from '../saved/BookmarkButton.jsx';

export default function ProfessionalCard({ pro, compare }) {
  return (
    <div className="relative">
    <Link to={`/professionals/${pro._id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      <div className="flex gap-4">
        <Avatar name={pro.fullName} src={pro.profileImage} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate pr-8 text-base font-semibold text-slate-900">{pro.fullName}</h3>
            {pro.verificationStatus === 'verified' && <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600"><BadgeCheck className="h-4 w-4" />Verified</span>}
          </div>
          <p className="text-sm text-slate-600">{pro.title} · {pro.category}</p>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <RatingStars value={pro.averageRating} />
            <span className="font-semibold">{pro.averageRating.toFixed(1)}</span>
            <span className="text-slate-500">({pro.reviewCount} reviews)</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{pro.location}</span>
            <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" />{pro.yearsOfExperience} yrs experience</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pro.specializations.slice(0, 4).map((s) => <Badge key={s} tone="gray">{s}</Badge>)}
          </div>
        </div>
      </div>
    </Link>
    <BookmarkButton professionalId={pro._id} className="absolute right-3 top-3" />
    {compare && (
      <label className={`absolute bottom-3 right-4 flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ${compare.checked ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100'}`}>
        <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={compare.checked} disabled={compare.disabled} onChange={compare.onToggle} />Compare
      </label>
    )}
    </div>
  );
}
