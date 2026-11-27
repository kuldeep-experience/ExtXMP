import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import Avatar from './Avatar.jsx';
import RatingStars from './RatingStars.jsx';

// Pick a professional from the directory API (top rated until you type). Calls onChange with the full public record.
export default function ProfessionalPicker({ value, onChange, error, label = 'Professional' }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState({ items: [], loading: false });

  useEffect(() => {
    if (value) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      api.get('/professionals', { params: { ...(q && { q }), sort: 'rating', limit: 5 } })
        .then((r) => alive && setState({ items: r.data.data, loading: false }))
        .catch(() => alive && setState({ items: [], loading: false }));
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, value]);

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-300 bg-slate-50 p-2.5">
          <Avatar name={value.fullName} src={value.profileImage} size="h-10 w-10 text-sm" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{value.fullName}</p><p className="truncate text-xs text-slate-500">{value.title} · {value.location}</p></div>
          <button type="button" onClick={() => onChange(null)} aria-label="Choose a different professional" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className={`rounded-xl border ${error ? 'border-red-400' : 'border-slate-300'}`}>
          <div className="relative border-b border-slate-200">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, title or specialty" aria-label="Search professionals" className="w-full rounded-t-xl py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <ul className="max-h-52 overflow-y-auto" role="listbox" aria-label="Professionals">
            {state.items.map((p) => (
              <li key={p._id}>
                <button type="button" role="option" onClick={() => onChange(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
                  <Avatar name={p.fullName} src={p.profileImage} size="h-9 w-9 text-xs" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.fullName}</span><span className="block truncate text-xs text-slate-500">{p.title} · {p.location}</span></span>
                  <span className="flex items-center gap-1 text-xs"><RatingStars value={p.averageRating} size="h-3 w-3" />{p.averageRating.toFixed(1)}</span>
                </button>
              </li>
            ))}
            {!state.loading && state.items.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">No professionals found</li>}
          </ul>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
