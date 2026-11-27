import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Search, MapPin, SlidersHorizontal, SearchX, BookmarkPlus, X, GitCompareArrows } from 'lucide-react';
import { Button, Card, Input, ListSkeleton, Pagination, Select } from '../components/ui/index.js';
import SearchFormModal from '../features/searches/SearchFormModal.jsx';
import { paramsToCriteria } from '../features/searches/criteria.js';
import { updateSearch } from '../features/searches/searchesSlice.js';
import { selectIsAuthenticated, selectUser } from '../features/auth/authSlice.js';
import { FILTER_KEYS, trackSearch, trackingOn } from '../lib/history.js';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import ProfessionalCard from '../features/professionals/ProfessionalCard.jsx';
import { fetchCategories, fetchProfessionals } from '../features/professionals/professionalsSlice.js';

const LIMIT = 10;
// URL parameters are the directory API's parameters, except these two UI-only ones.
const apiParams = (sp) => { const o = Object.fromEntries(sp); delete o.savedSearch; delete o.near; return { ...o, limit: LIMIT }; };
const sortOptions = [
  { value: 'rating', label: 'Highest rated' },
  { value: 'reviews', label: 'Most reviewed' },
  { value: 'experience', label: 'Most experienced' },
  { value: 'name', label: 'Name (A–Z)' },
];
const ratingOptions = [{ value: '', label: 'Any rating' }, { value: '3', label: '3.0 & up' }, { value: '3.5', label: '3.5 & up' }, { value: '4', label: '4.0 & up' }, { value: '4.5', label: '4.5 & up' }];
const expOptions = [{ value: '', label: 'Any experience' }, { value: '5', label: '5+ years' }, { value: '10', label: '10+ years' }, { value: '15', label: '15+ years' }, { value: '20', label: '20+ years' }];

export default function Professionals() {
  const [params, setParams] = useSearchParams();
  const dispatch = useDispatch();
  const { items, pagination, status, error } = useSelector((s) => s.professionals.list);
  const categories = useSelector((s) => s.professionals.categories.items);
  const [showFilters, setShowFilters] = useState(false);
  const authed = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);
  const [compare, setCompare] = useState([]); // professionals picked for comparison: { id, name }
  const lastTracked = useRef(null);
  const toast = useToast();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [saveOpen, setSaveOpen] = useState(false);
  const [origin, setOrigin] = useState(null); // the saved search this page was opened from
  const [q, setQ] = useState(params.get('q') || '');
  const [location, setLocation] = useState(params.get('location') || '');

  const get = (k, d = '') => params.get(k) || d;
  const page = Number(get('page', 1));
  const query = params.toString();
  const savedSearchId = get('savedSearch');
  const selectedSvcs = get('services') ? get('services').split(',') : [];
  const geoActive = params.has('lat') && params.has('lng') && params.has('maxDistanceKm');
  const selectedSpecs = get('specialization') ? get('specialization').split(',') : [];

  useEffect(() => { dispatch(fetchCategories()); }, [dispatch]);
  useEffect(() => {
    if (!savedSearchId || !authed) return setOrigin(null);
    api.get(`/saved-searches/${savedSearchId}`).then((r) => setOrigin(r.data.data)).catch(() => setOrigin(null));
  }, [savedSearchId, authed]);
  useEffect(() => {
    dispatch(fetchProfessionals(apiParams(new URLSearchParams(query))));
    setQ(new URLSearchParams(query).get('q') || '');
    setLocation(new URLSearchParams(query).get('location') || '');
  }, [dispatch, query]);

  // Update one or more params; any filter change returns to page 1.
  const update = (changes, keepPage = false) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v === '' || v == null || v === false ? next.delete(k) : next.set(k, v)));
    if (!keepPage) next.delete('page');
    setParams(next);
  };

  const category = categories.find((c) => c.slug === get('category'));
  const specOptions = category ? category.specializations : [...new Set(categories.flatMap((c) => c.specializations))].sort();
  const svcOptions = category ? category.services || [] : [...new Set(categories.flatMap((c) => c.services || []))].sort();
  const toggleSvc = (s) => update({ services: (selectedSvcs.includes(s) ? selectedSvcs.filter((x) => x !== s) : [...selectedSvcs, s]).join(',') });
  const toggleSpec = (s) => update({ specialization: (selectedSpecs.includes(s) ? selectedSpecs.filter((x) => x !== s) : [...selectedSpecs, s]).join(',') });
  const hasFilters = ['q', 'category', 'location', 'specialization', 'services', 'minRating', 'minExperience', 'verified', 'maxDistanceKm'].some((k) => params.has(k));

  // Record a search in the visitor's history once its results have loaded (not page or sort-only changes).
  useEffect(() => {
    if (!trackingOn(user) || !hasFilters || status !== 'succeeded') return undefined;
    const all = Object.fromEntries(params);
    const { q = '', ...rest } = all;
    const filters = Object.fromEntries(Object.entries(rest).filter(([k, v]) => FILTER_KEYS.includes(k) && v !== ''));
    const key = JSON.stringify([q, filters]);
    if (lastTracked.current === key) return undefined;
    const t = setTimeout(() => { lastTracked.current = key; trackSearch(q, filters); }, 800);
    return () => clearTimeout(t);
  }, [query, status, user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCompare = (p) => setCompare((c) => (c.some((x) => x.id === p._id) ? c.filter((x) => x.id !== p._id) : c.length < 4 ? [...c, { id: p._id, name: p.fullName }] : c));
  const criteria = paramsToCriteria(params);
  const openSave = () => (authed ? setSaveOpen(true) : (toast.info('Log in to save searches.'), navigate('/login', { state: { from: routeLocation } })));
  const updateOrigin = async () => {
    const res = await dispatch(updateSearch({ id: origin._id, ...criteria }));
    res.error ? toast.error(res.payload?.message || 'Could not update') : (toast.success(`Updated “${origin.name}”`), setOrigin(res.payload));
  };

  const from = pagination ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const to = pagination ? from + items.length - 1 : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Find a professional</h1>
          <p className="mt-1 text-slate-500">Search verified professionals and compare ratings, experience and reviews.</p>
        </div>
        <Button variant="secondary" onClick={openSave} disabled={!hasFilters}><BookmarkPlus className="h-4 w-4" />Save this search</Button>
      </div>
      {origin && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">
          <span>Showing saved search <strong>{origin.name}</strong>. Change the filters, then update it to keep them.</span>
          <span className="flex gap-2"><Button size="sm" variant="secondary" onClick={updateOrigin}>Update saved search</Button><Link to="/dashboard/search-preferences"><Button size="sm" variant="ghost">My search preferences</Button></Link></span>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); update({ q: q.trim(), location: location.trim() }); }}
        className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[1fr_1fr_auto]">
        <Input icon={Search} placeholder="Name, title or specialty" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by name, title or specialty" />
        <Input icon={MapPin} placeholder="City or state" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
        <Button type="submit">Search</Button>
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_1fr]">
        <div>
          <Button variant="secondary" className="mb-3 w-full lg:hidden" onClick={() => setShowFilters((v) => !v)}><SlidersHorizontal className="h-4 w-4" />{showFilters ? 'Hide filters' : 'Show filters'}</Button>
          <Card className={`${showFilters ? 'block' : 'hidden'} space-y-4 lg:block`} title="Filters" action={hasFilters && <button className="text-xs text-brand-600 hover:underline" onClick={() => { setParams({}); }}>Clear all</button>}>
            <Select label="Category" value={get('category')} onChange={(e) => update({ category: e.target.value, specialization: '' })}
              options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.slug, label: `${c.name} (${c.count})` }))]} />
            <Select label="Minimum rating" value={get('minRating')} onChange={(e) => update({ minRating: e.target.value })} options={ratingOptions} />
            <Select label="Experience" value={get('minExperience')} onChange={(e) => update({ minExperience: e.target.value })} options={expOptions} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={get('verified') === 'true'} onChange={(e) => update({ verified: e.target.checked })} />
              Verified only
            </label>
            {svcOptions.length > 0 && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-700">Services</legend>
                <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {svcOptions.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={selectedSvcs.includes(s)} onChange={() => toggleSvc(s)} />{s}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">Specializations</legend>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {specOptions.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={selectedSpecs.includes(s)} onChange={() => toggleSpec(s)} />{s}
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>
        </div>

        <section aria-live="polite">
          {geoActive && (
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
              <MapPin className="h-4 w-4" />Within {get('maxDistanceKm')} km of {get('near') || 'selected location'}
              <button aria-label="Remove distance filter" onClick={() => update({ lat: '', lng: '', maxDistanceKm: '', near: '' })}><X className="h-4 w-4" /></button>
            </p>
          )}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {pagination ? (pagination.total ? `Showing ${from}–${to} of ${pagination.total} professionals` : '0 professionals found') : ' '}
            </p>
            <Select aria-label="Sort by" value={get('sort', 'rating')} onChange={(e) => update({ sort: e.target.value })} options={sortOptions} className="w-48" />
          </div>

          {status === 'loading' && !items.length && <ListSkeleton count={4} className="space-y-4" />}
          {status === 'failed' && (
            <Card className="text-center"><p className="text-red-600">Could not load professionals: {error}</p>
              <Button className="mt-3" variant="secondary" onClick={() => dispatch(fetchProfessionals(apiParams(params)))}>Try again</Button></Card>
          )}
          {status === 'succeeded' && items.length === 0 && (
            <Card className="flex flex-col items-center py-14 text-center">
              <SearchX className="h-10 w-10 text-slate-300" />
              <p className="mt-3 font-medium">No professionals match your search</p>
              <p className="text-sm text-slate-500">Try removing a filter or searching a different location.</p>
              {hasFilters && <Button className="mt-4" variant="secondary" onClick={() => setParams({})}>Clear filters</Button>}
            </Card>
          )}
          <div className={`space-y-4 transition-opacity ${status === 'loading' ? 'opacity-60' : ''}`}>
            {items.map((p) => <ProfessionalCard key={p._id} pro={p} compare={{ checked: compare.some((x) => x.id === p._id), disabled: compare.length >= 4 && !compare.some((x) => x.id === p._id), onToggle: () => toggleCompare(p) }} />)}
          </div>
          {pagination && (
            <div className="mt-6">
              <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={(n) => { update({ page: n > 1 ? n : '' }, true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </div>
          )}
        </section>
      </div>
      <SearchFormModal open={saveOpen} mode="create" initial={{ ...criteria, name: '' }} onClose={() => setSaveOpen(false)} />
      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-3 shadow-lg" role="region" aria-label="Comparison">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 text-sm font-medium"><GitCompareArrows className="h-4 w-4" />Compare ({compare.length}/4)</span>
            <div className="flex flex-1 flex-wrap gap-2">
              {compare.map((c) => <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs">{c.name}<button aria-label={`Remove ${c.name}`} onClick={() => setCompare((x) => x.filter((y) => y.id !== c.id))}><X className="h-3 w-3" /></button></span>)}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCompare([])}>Clear</Button>
            <Button size="sm" disabled={compare.length < 2} onClick={() => navigate(`/compare?ids=${compare.map((c) => c.id).join(',')}`)}>{compare.length < 2 ? 'Pick one more' : 'Compare'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
