import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { LocateFixed, X } from 'lucide-react';
import { Button, Input, Modal, Select } from '../../components/ui/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { fetchCategories } from '../professionals/professionalsSlice.js';
import { createSearch, fetchLocations, updateSearch } from './searchesSlice.js';
import { effectiveDistance } from './criteria.js';

const ratingOptions = [{ value: '', label: 'Any rating' }, { value: '3', label: '3.0 & up' }, { value: '3.5', label: '3.5 & up' }, { value: '4', label: '4.0 & up' }, { value: '4.5', label: '4.5 & up' }];
const expOptions = [{ value: '', label: 'Any experience' }, { value: '5', label: '5+ years' }, { value: '10', label: '10+ years' }, { value: '15', label: '15+ years' }, { value: '20', label: '20+ years' }];
const sortOptions = [{ value: 'rating', label: 'Highest rated' }, { value: 'reviews', label: 'Most reviewed' }, { value: 'experience', label: 'Most experienced' }, { value: 'name', label: 'Name (A–Z)' }];

const blank = { name: '', category: '', location: '', coords: null, coordSource: null, distance: '', minRating: '', specializations: [], serviceRequirements: [], keyword: '', minExperience: '', verifiedOnly: false, sort: 'rating' };

// mode "create": initial = criteria from the directory page (or empty). mode "edit": initial = a saved search.
export default function SearchFormModal({ open, mode = 'create', initial, onClose, onSaved }) {
  const dispatch = useDispatch();
  const toast = useToast();
  const categories = useSelector((s) => s.professionals.categories.items);
  const locations = useSelector((s) => s.searches.locations.items);
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((v) => ({ ...v, ...patch }));

  useEffect(() => { if (open) { if (!categories.length) dispatch(fetchCategories()); if (!locations.length) dispatch(fetchLocations()); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset only when the modal opens or the criteria really change: parents often pass a new object on every render.
  const initialKey = JSON.stringify(initial ?? null);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    const i = initial;
    if (!i) return setF(blank);
    const hasCoords = typeof i.latitude === 'number' && typeof i.longitude === 'number';
    const dist = effectiveDistance(i);
    setF({
      name: i.name || '', category: i.category || '', location: i.location || '',
      coords: hasCoords ? { lat: i.latitude, lng: i.longitude } : null, coordSource: hasCoords ? 'saved' : null,
      distance: dist != null ? String(dist) : '', minRating: i.minRating != null ? String(i.minRating) : '',
      specializations: i.specializations || [], serviceRequirements: i.serviceRequirements || [],
      keyword: i.additionalFilters?.keyword || '', minExperience: i.additionalFilters?.minExperience != null ? String(i.additionalFilters.minExperience) : '',
      verifiedOnly: !!i.additionalFilters?.verifiedOnly, sort: i.additionalFilters?.sort || 'rating',
    });
  }, [open, initialKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const cat = categories.find((c) => c.slug === f.category);
  const specOptions = useMemo(() => (cat ? cat.specializations : [...new Set(categories.flatMap((c) => c.specializations))].sort()), [cat, categories]);
  const svcOptions = useMemo(() => (cat ? cat.services : [...new Set(categories.flatMap((c) => c.services || []))].sort()), [cat, categories]);

  // Coordinates come either from a directory city (the text matches its label) or from the device.
  const cityMatch = f.coords && locations.find((l) => l.label.toLowerCase() === f.location.trim().toLowerCase());
  const fromDevice = !!f.coords && !cityMatch;
  const onLocation = (value) => {
    const city = locations.find((l) => l.label.toLowerCase() === value.trim().toLowerCase());
    if (city) set({ location: city.label, coords: { lat: city.lat, lng: city.lng }, coordSource: 'city' });
    else set({ location: value, ...(f.coords && !fromDevice ? { coords: null, coordSource: null, distance: '' } : {}) });
  };
  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error('Your browser does not support location.');
    navigator.geolocation.getCurrentPosition(
      (pos) => set({ coords: { lat: +pos.coords.latitude.toFixed(4), lng: +pos.coords.longitude.toFixed(4) }, coordSource: 'device', location: 'My location' }),
      () => toast.error('Could not get your location. Choose a city from the list instead.'),
    );
  };
  const toggle = (key, value) => set({ [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] });

  const submit = async (e) => {
    e.preventDefault();
    if (f.distance && !f.coords) return setErrors({ maxDistanceKm: ['Choose a city from the list or use your location to search by distance'] });
    const geo = f.coords && f.distance;
    const body = {
      name: f.name, category: f.category || null, location: f.location.trim(),
      latitude: geo ? f.coords.lat : null, longitude: geo ? f.coords.lng : null,
      radiusKm: null, maxDistanceKm: geo ? Number(f.distance) : null,
      minRating: f.minRating ? Number(f.minRating) : null,
      specializations: f.specializations, serviceRequirements: f.serviceRequirements,
      additionalFilters: { keyword: f.keyword.trim(), minExperience: f.minExperience ? Number(f.minExperience) : null, verifiedOnly: f.verifiedOnly, sort: f.sort },
    };
    setBusy(true);
    const res = await dispatch(mode === 'edit' ? updateSearch({ id: initial._id, ...body }) : createSearch(body));
    setBusy(false);
    if (res.error) { setErrors(res.payload?.details || {}); return toast.error(res.payload?.message || 'Could not save the search'); }
    toast.success(mode === 'edit' ? 'Search updated' : 'Search saved');
    onSaved?.(res.payload);
    onClose();
  };
  const err = (k) => errors[k]?.[0];
  const chip = (active) => `rounded-full border px-3 py-1 text-xs ${active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`;

  return (
    <Modal open={open} onClose={onClose} size="lg" title={mode === 'edit' ? 'Edit saved search' : 'Save this search'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="search-form" loading={busy}>{mode === 'edit' ? 'Save changes' : 'Save search'}</Button></>}>
      <form id="search-form" className="space-y-4" onSubmit={submit} noValidate>
        {err('_form') && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err('_form')}</p>}
        <Input label="Search name" required maxLength={80} placeholder="e.g. Top-rated agents in Austin" value={f.name} onChange={(e) => set({ name: e.target.value })} error={err('name')} autoFocus />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Professional category" value={f.category} onChange={(e) => set({ category: e.target.value, specializations: [], serviceRequirements: [] })}
            options={[{ value: '', label: 'Any category' }, ...categories.map((c) => ({ value: c.slug, label: c.name }))]} />
          <Select label="Minimum rating" value={f.minRating} onChange={(e) => set({ minRating: e.target.value })} options={ratingOptions} />
        </div>
        {err('category') && <p className="text-xs text-red-600">{err('category')}</p>}

        <div>
          <label htmlFor="ss-location" className="mb-1.5 block text-sm font-medium text-slate-700">Location</label>
          <div className="flex gap-2">
            <input id="ss-location" list="ss-cities" value={f.location} onChange={(e) => onLocation(e.target.value)} placeholder="City, state or ZIP"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <datalist id="ss-cities">{locations.map((l) => <option key={l.label} value={l.label} />)}</datalist>
            <Button type="button" variant="secondary" onClick={useMyLocation} title="Use my current location"><LocateFixed className="h-4 w-4" />Use mine</Button>
          </div>
          {f.coords && (
            <p className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
              {cityMatch ? 'Coordinates matched from the directory.' : `Using saved coordinates (${f.coords.lat}, ${f.coords.lng}).`}
              <button type="button" className="text-brand-600 hover:underline" onClick={() => set({ coords: null, coordSource: null, distance: '', ...(fromDevice ? { location: '' } : {}) })}><X className="inline h-3 w-3" /> Clear</button>
            </p>
          )}
        </div>
        <Input label="Distance from location (km, optional)" type="number" min={1} max={500} placeholder="e.g. 25" value={f.distance} disabled={!f.coords}
          onChange={(e) => set({ distance: e.target.value })} error={err('maxDistanceKm') || err('radiusKm') || err('latitude')} />

        {specOptions.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Specializations</legend>
            <div className="flex flex-wrap gap-2">{specOptions.map((s) => <button type="button" key={s} aria-pressed={f.specializations.includes(s)} className={chip(f.specializations.includes(s))} onClick={() => toggle('specializations', s)}>{s}</button>)}</div>
            {err('specializations') && <p className="mt-1 text-xs text-red-600">{err('specializations')}</p>}
          </fieldset>
        )}
        {svcOptions.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Service requirements</legend>
            <div className="flex flex-wrap gap-2">{svcOptions.map((s) => <button type="button" key={s} aria-pressed={f.serviceRequirements.includes(s)} className={chip(f.serviceRequirements.includes(s))} onClick={() => toggle('serviceRequirements', s)}>{s}</button>)}</div>
            {err('serviceRequirements') && <p className="mt-1 text-xs text-red-600">{err('serviceRequirements')}</p>}
          </fieldset>
        )}

        <details className="rounded-xl border border-slate-200 p-3" open={!!(f.keyword || f.minExperience || f.verifiedOnly || f.sort !== 'rating')}>
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Additional filters</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Input label="Keyword" placeholder="Name, title or specialty" value={f.keyword} onChange={(e) => set({ keyword: e.target.value })} />
            <Select label="Experience" value={f.minExperience} onChange={(e) => set({ minExperience: e.target.value })} options={expOptions} />
            <Select label="Sort results by" value={f.sort} onChange={(e) => set({ sort: e.target.value })} options={sortOptions} />
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={f.verifiedOnly} onChange={(e) => set({ verifiedOnly: e.target.checked })} />Verified only</label>
          </div>
        </details>
      </form>
    </Modal>
  );
}
