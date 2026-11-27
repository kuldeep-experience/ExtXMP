import { Link } from 'react-router-dom';
import { BadgeCheck, CalendarDays, MapPin, StickyNote, Trash2 } from 'lucide-react';
import { Avatar, Badge, Card, RatingStars, Select } from '../../components/ui/index.js';

const fmt = (d) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export default function SavedCard({ item, folders, onMove, onNote, onRemove }) {
  const p = item.professional;
  return (
    <Card className="flex h-full flex-col">
      <div className="flex gap-3">
        <Avatar name={p.fullName} src={p.profileImage} size="h-14 w-14 text-lg" />
        <div className="min-w-0 flex-1">
          <Link to={`/professionals/${p._id}`} className="flex items-center gap-1 font-semibold text-slate-900 hover:text-brand-600">
            <span className="truncate">{p.fullName}</span>
            {p.verificationStatus === 'verified' && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-600" aria-label="Verified" />}
          </Link>
          <p className="truncate text-sm text-slate-600">{p.title}</p>
          <div className="mt-1 flex items-center gap-1.5 text-sm"><RatingStars value={p.averageRating} /><span className="font-medium">{p.averageRating.toFixed(1)}</span><span className="text-slate-500">({p.reviewCount})</span></div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.location}</span>
        <Badge tone="gray">{p.category}</Badge>
      </div>

      {item.note ? (
        <button onClick={() => onNote(item)} className="mt-3 rounded-xl bg-amber-50 p-3 text-left text-sm text-amber-900 hover:bg-amber-100" title="Edit note">
          <span className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-700"><StickyNote className="h-3.5 w-3.5" />My note</span>
          <span className="line-clamp-3 whitespace-pre-line">{item.note}</span>
        </button>
      ) : (
        <button onClick={() => onNote(item)} className="mt-3 flex items-center gap-1 text-left text-sm text-brand-600 hover:underline"><StickyNote className="h-4 w-4" />Add a private note</button>
      )}

      <div className="mt-auto pt-4">
        <p className="mb-3 flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />Saved on {fmt(item.savedAt)}</p>
        <div className="flex items-end gap-2">
          <Select aria-label={`Folder for ${p.fullName}`} className="flex-1" value={item.folder || ''} onChange={(e) => onMove(item, e.target.value || null)}
            options={[{ value: '', label: 'Unfiled' }, ...folders.map((f) => ({ value: f._id, label: f.name }))]} />
          <Link to={`/professionals/${p._id}`} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">View</Link>
          <button onClick={() => onRemove(item)} aria-label={`Remove ${p.fullName}`} title="Remove" className="rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-5 w-5" /></button>
        </div>
      </div>
    </Card>
  );
}
