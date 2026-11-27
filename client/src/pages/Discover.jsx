import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { ArrowRight, Compass, Search, Sparkles } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, Input, ListSkeleton, PageHeader, Select, Skeleton } from '../components/ui/index.js';
import ProfessionalCard from '../features/professionals/ProfessionalCard.jsx';
import { fetchCategories, fetchFeatured } from '../features/professionals/professionalsSlice.js';

// Starting point for finding professionals: search, browse by category, and top-rated professionals from the directory.
export default function Discover() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const categories = useSelector((s) => s.professionals.categories);
  const featured = useSelector((s) => s.professionals.featured);
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => { dispatch(fetchCategories()); dispatch(fetchFeatured()); }, [dispatch]);
  const search = (e) => {
    e.preventDefault();
    navigate(`/professionals?${new URLSearchParams({ ...(q.trim() && { q: q.trim() }), ...(location.trim() && { location: location.trim() }), ...(category && { category }) })}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader icon={Compass} title="Discovery" description="Search the directory, browse by category, or let the assistant suggest someone." />

      <Card>
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_14rem_auto]" onSubmit={search}>
          <Input icon={Search} placeholder="Name, title or specialty" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search professionals" />
          <Input placeholder="City or state" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: '', label: 'All categories' }, ...categories.items.map((c) => ({ value: c.slug, label: c.name }))]} />
          <Button type="submit">Search</Button>
        </form>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Browse by category</h2>
        {categories.status === 'failed' ? <ErrorState message={categories.error} onRetry={() => dispatch(fetchCategories())} /> : categories.status !== 'succeeded' ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.items.map((c) => (
              <Link key={c.slug} to={`/professionals?category=${c.slug}`} className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md">
                <span><span className="block font-semibold text-slate-900">{c.name}</span><span className="text-sm text-slate-500">{c.count} professionals</span></span>
                <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Top-rated verified professionals</h2><Link to="/professionals" className="text-sm font-medium text-brand-600 hover:underline">Browse all</Link></div>
        {featured.status === 'failed' ? <ErrorState message={featured.error} onRetry={() => dispatch(fetchFeatured())} /> : featured.status !== 'succeeded' ? <ListSkeleton count={3} className="grid gap-4 lg:grid-cols-3" /> : featured.items.length === 0 ? <EmptyState title="No professionals to show yet" /> : (
          <div className="grid gap-4 lg:grid-cols-3">{featured.items.map((p) => <ProfessionalCard key={p._id} pro={p} />)}</div>
        )}
      </section>

      <Card className="flex flex-wrap items-center justify-between gap-4 border-brand-100 bg-gradient-to-r from-brand-50 to-white">
        <div className="flex items-center gap-3"><Sparkles className="h-8 w-8 text-brand-600" /><div><h3 className="font-semibold">Not sure who to pick?</h3><p className="text-sm text-slate-600">Describe what you need and the assistant will rank real professionals for you.</p></div></div>
        <Link to="/dashboard/ai-assistant"><Button>Ask the assistant</Button></Link>
      </Card>
    </div>
  );
}
