import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowLeft, BadgeCheck, X } from 'lucide-react';
import { Avatar, Badge, Button, Card, Loader, RatingStars } from '../components/ui/index.js';
import BookmarkButton from '../features/saved/BookmarkButton.jsx';
import { selectUser } from '../features/auth/authSlice.js';
import { api, errorMessage } from '../lib/api.js';
import { trackComparison, trackingOn } from '../lib/history.js';

// Side-by-side comparison of 2-4 professionals. Opening it is recorded in the visitor's comparison history.
export default function Compare() {
  const [params] = useSearchParams();
  const ids = params.get('ids') || '';
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const [state, setState] = useState({ status: 'loading', pros: [], unavailable: 0, error: null });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading', pros: [], unavailable: 0, error: null });
    api.get('/professionals/compare', { params: { ids } })
      .then((r) => { if (alive) { setState({ status: 'ready', pros: r.data.data, unavailable: r.data.unavailable, error: null }); if (trackingOn(user)) trackComparison(r.data.data.map((p) => p._id)); } })
      .catch((e) => alive && setState({ status: 'failed', pros: [], unavailable: 0, error: errorMessage(e) }));
    return () => { alive = false; };
  }, [ids, !!user]); // eslint-disable-line react-hooks/exhaustive-deps

  const { pros } = state;
  const best = (key) => { const max = Math.max(...pros.map((p) => p[key])); return pros.every((p) => p[key] === max) ? null : max; };
  const bests = pros.length ? { averageRating: best('averageRating'), reviewCount: best('reviewCount'), yearsOfExperience: best('yearsOfExperience') } : {};
  const removeOne = (id) => navigate(`/compare?ids=${pros.filter((p) => p._id !== id).map((p) => p._id).join(',')}`, { replace: true });
  const top = (key, p) => bests[key] != null && p[key] === bests[key] && <Badge tone="green">Highest</Badge>;

  const rows = [
    ['Category', (p) => p.category],
    ['Title', (p) => p.title],
    ['Location', (p) => p.location],
    ['Rating', (p) => <span className="inline-flex items-center gap-1.5"><RatingStars value={p.averageRating} /><strong>{p.averageRating.toFixed(1)}</strong>{top('averageRating', p)}</span>],
    ['Reviews', (p) => <span className="inline-flex items-center gap-2">{p.reviewCount}{top('reviewCount', p)}</span>],
    ['Experience', (p) => <span className="inline-flex items-center gap-2">{p.yearsOfExperience} years{top('yearsOfExperience', p)}</span>],
    ['Verified', (p) => (p.verificationStatus === 'verified' ? <span className="inline-flex items-center gap-1 text-brand-600"><BadgeCheck className="h-4 w-4" />Verified</span> : 'Not verified')],
    ['Specializations', (p) => <div className="flex flex-wrap gap-1">{p.specializations.map((s) => <Badge key={s} tone="gray">{s}</Badge>)}</div>],
    ['Services', (p) => <ul className="list-disc space-y-0.5 pl-4">{p.services.map((s) => <li key={s}>{s}</li>)}</ul>],
    ['Qualifications', (p) => <ul className="list-disc space-y-0.5 pl-4">{p.qualifications.map((s) => <li key={s}>{s}</li>)}</ul>],
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link to="/professionals" className="mb-4 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" />Back to professionals</Link>
      <h1 className="text-3xl font-bold">Compare professionals</h1>
      {state.status === 'loading' && <Loader label="Loading comparison…" />}
      {state.status === 'failed' && <Card className="mt-6 text-center"><p className="text-red-600">{state.error}</p><Link to="/professionals" className="mt-3 inline-block"><Button variant="secondary">Choose professionals</Button></Link></Card>}
      {state.status === 'ready' && (
        <>
          {state.unavailable > 0 && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{state.unavailable} professional{state.unavailable === 1 ? ' is' : 's are'} no longer available and not shown.</p>}
          {!user && <p className="mt-3 text-sm text-slate-500">Log in to keep a history of your comparisons.</p>}
          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full table-fixed text-sm">
              <thead>
                <tr className="align-top">
                  <th className="w-32 bg-slate-50 p-4" />
                  {pros.map((p) => (
                    <th key={p._id} className="min-w-56 p-4 text-left font-normal">
                      <div className="flex items-start gap-3">
                        <Avatar name={p.fullName} src={p.profileImage} size="h-12 w-12 text-base" />
                        <div className="min-w-0 flex-1"><Link to={`/professionals/${p._id}`} className="block truncate font-semibold text-slate-900 hover:text-brand-600">{p.fullName}</Link></div>
                        {pros.length > 2 && <button aria-label={`Remove ${p.fullName} from comparison`} onClick={() => removeOne(p._id)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
                      </div>
                      <div className="mt-3 flex gap-2"><Link to={`/professionals/${p._id}`} className="flex-1 rounded-xl bg-brand-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-brand-700">View profile</Link><BookmarkButton professionalId={p._id} variant="button" /></div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(([label, render]) => (
                  <tr key={label} className="align-top"><th scope="row" className="bg-slate-50 p-4 text-left font-medium text-slate-600">{label}</th>{pros.map((p) => <td key={p._id} className="p-4 text-slate-700">{render(p)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
