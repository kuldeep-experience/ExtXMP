import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Star } from 'lucide-react';
import { Card, Loader, Pagination, RatingStars, Select } from '../../components/ui/index.js';
import { fetchReviews } from './professionalsSlice.js';

const sorts = [
  { value: 'recent', label: 'Most recent' },
  { value: 'highest', label: 'Highest rated' },
  { value: 'lowest', label: 'Lowest rated' },
];
const fmt = (d) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export default function ReviewsSection({ professionalId }) {
  const dispatch = useDispatch();
  const { items, pagination, summary, status, error } = useSelector((s) => s.professionals.reviews);
  const [sort, setSort] = useState('recent');
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setSort('recent'); setRating(''); setPage(1); }, [professionalId]);
  useEffect(() => {
    dispatch(fetchReviews({ id: professionalId, sort, page, limit: 6, ...(rating && { rating }) }));
  }, [dispatch, professionalId, sort, rating, page]);

  return (
    <Card title="Reviews">
      {summary && (
        <div className="mb-6 grid gap-6 sm:grid-cols-[10rem_1fr]">
          <div className="text-center sm:text-left">
            <p className="text-4xl font-bold">{summary.average.toFixed(1)}</p>
            <RatingStars value={summary.average} size="h-5 w-5" />
            <p className="mt-1 text-sm text-slate-500">{summary.count} reviews</p>
          </div>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((n) => (
              <button key={n} onClick={() => { setRating(rating === String(n) ? '' : String(n)); setPage(1); }}
                className={`flex w-full items-center gap-2 rounded-lg px-1 text-sm hover:bg-slate-50 ${rating === String(n) ? 'bg-brand-50' : ''}`} aria-pressed={rating === String(n)}>
                <span className="flex w-6 items-center gap-0.5">{n}<Star className="h-3 w-3 text-slate-400" /></span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${summary.count ? (summary.distribution[n] / summary.count) * 100 : 0}%` }} />
                </span>
                <span className="w-6 text-right text-slate-500">{summary.distribution[n]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mb-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-sm text-slate-500">{rating ? `${rating}-star reviews` : 'All reviews'}</p>
        <Select aria-label="Sort reviews" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} options={sorts} className="w-44" />
      </div>
      {status === 'loading' && !items.length && <Loader label="Loading reviews…" />}
      {status === 'failed' && <p className="text-sm text-red-600">Could not load reviews: {error}</p>}
      {status === 'succeeded' && items.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No reviews match this filter.</p>}
      <ul className={`divide-y divide-slate-100 ${status === 'loading' ? 'opacity-60' : ''}`}>
        {items.map((r) => (
          <li key={r._id} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><RatingStars value={r.rating} /><span className="font-medium">{r.title}</span></div>
              <time className="text-xs text-slate-500" dateTime={r.reviewDate}>{fmt(r.reviewDate)}</time>
            </div>
            <p className="mt-2 text-sm text-slate-700">{r.text}</p>
            <p className="mt-2 text-xs text-slate-500">{r.reviewerName}{r.serviceCategory && ` · ${r.serviceCategory}`}</p>
          </li>
        ))}
      </ul>
      {pagination && <div className="mt-4"><Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={setPage} /></div>}
    </Card>
  );
}
