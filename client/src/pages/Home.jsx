import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Search, MapPin, ShieldCheck, CalendarCheck, MessageSquareText, UserRoundSearch, Users } from 'lucide-react';
import { Button, Card, Input, Loader } from '../components/ui/index.js';
import ProfessionalCard from '../features/professionals/ProfessionalCard.jsx';
import { fetchCategories, fetchFeatured } from '../features/professionals/professionalsSlice.js';

const steps = [
  { icon: UserRoundSearch, title: 'Discover', text: 'Search verified professionals by specialty and location.' },
  { icon: MessageSquareText, title: 'Compare', text: 'Read genuine reviews and ratings from real experiences.' },
  { icon: CalendarCheck, title: 'Contact', text: 'Message a professional directly. They reply to you by email and in your chat.' },
  { icon: ShieldCheck, title: 'Share your experience', text: 'Leave a review to help the next visitor decide.' },
];

export default function Home() {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const featured = useSelector((s) => s.professionals.featured);
  const categories = useSelector((s) => s.professionals.categories.items);

  useEffect(() => { dispatch(fetchFeatured()); dispatch(fetchCategories()); }, [dispatch]);

  const search = (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    if (location.trim()) p.set('location', location.trim());
    navigate(`/professionals?${p}`);
  };

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Find professionals you can <span className="text-brand-600">trust</span>
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Discover, compare and book experienced professionals, backed by reviews from real visitors.
            </p>
          </div>
          <form id="discover" onSubmit={search} className="mx-auto mt-10 grid max-w-3xl gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:grid-cols-[1fr_1fr_auto]">
            <Input icon={Search} placeholder="Specialty or name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Specialty or name" />
            <Input icon={MapPin} placeholder="City or ZIP" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
            <Button type="submit" size="lg">Search</Button>
          </form>
          {categories.length > 0 && (
            <div className="mx-auto mt-5 flex max-w-3xl flex-wrap justify-center gap-2">
              {categories.map((c) => (
                <Link key={c.slug} to={`/professionals?category=${c.slug}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition hover:border-brand-500 hover:text-brand-600">{c.name}</Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold">Featured professionals</h2>
        <p className="mt-1 text-slate-500">Top-rated verified professionals.</p>
        {featured.status === 'loading' && <Loader label="Loading professionals…" />}
        {featured.status === 'failed' && <Card className="mt-6 text-center text-sm text-red-600">Could not load professionals: {featured.error}</Card>}
        {featured.status === 'succeeded' && featured.items.length === 0 && (
          <Card className="mt-6 flex flex-col items-center py-12 text-center"><Users className="h-10 w-10 text-slate-300" /><p className="mt-3 font-medium">No professionals to show yet</p></Card>
        )}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">{featured.items.map((p) => <ProfessionalCard key={p._id} pro={p} />)}</div>
        <div className="mt-6 text-center"><Link to="/professionals"><Button variant="secondary">Browse all professionals</Button></Link></div>
      </section>

      <section id="how-it-works" className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold">How Experience.com works</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <Card key={title} className="transition-shadow hover:shadow-md">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-4 font-semibold">{i + 1}. {title}</h3>
                <p className="mt-1 text-sm text-slate-500">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
