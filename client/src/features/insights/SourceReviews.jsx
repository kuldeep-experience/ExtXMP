import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { Loader, RatingStars } from '../../components/ui/index.js';
import { fetchInsightSources } from './insightsSlice.js';

const fmt = (d) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

// The original reviews behind one insight, loaded on demand. The server only returns reviews that are still approved and visible.
export default function SourceReviews({ professionalId, ids, highlightId, reviewsHref }) {
  const dispatch = useDispatch();
  const [state, setState] = useState({ status: 'loading', items: [], error: null });
  useEffect(() => {
    let alive = true;
    dispatch(fetchInsightSources({ professionalId, ids }))
      .unwrap()
      .then((items) => alive && setState({ status: 'ready', items, error: null }))
      .catch((e) => alive && setState({ status: 'failed', items: [], error: e?.message }));
    return () => { alive = false; };
  }, [professionalId, ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.status === 'loading') return <Loader label="Loading reviews…" />;
  if (state.status === 'failed') return <p className="py-2 text-sm text-red-600">Could not load the reviews: {state.error}</p>;
  if (!state.items.length) return <p className="py-2 text-sm text-slate-500">These reviews are no longer available.</p>;
  return (
    <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
      <ul className="divide-y divide-slate-200">
        {state.items.map((r) => (
          <li key={r._id} id={`source-${r._id}`} className={`py-3 first:pt-0 last:pb-0 ${r._id === highlightId ? '-mx-2 rounded-lg bg-amber-50 px-2' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm"><RatingStars value={r.rating} /><strong>{r.title}</strong></span>
              <time className="text-xs text-slate-500" dateTime={r.reviewDate}>{fmt(r.reviewDate)}</time>
            </div>
            <p className="mt-1 text-sm text-slate-700">{r.text}</p>
            <p className="mt-1 text-xs text-slate-500">{r.reviewerName}{r.serviceCategory && ` · ${r.serviceCategory}`}</p>
          </li>
        ))}
      </ul>
      {reviewsHref && (reviewsHref.startsWith('#') ? <a href={reviewsHref} className="text-sm font-medium text-brand-600 hover:underline">See all reviews</a> : <Link to={reviewsHref} className="text-sm font-medium text-brand-600 hover:underline">See all reviews on the profile</Link>)}
    </div>
  );
}
