import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { ArrowLeft, Award, BadgeCheck, Briefcase, Globe, Mail, MapPin, MessageSquare, Phone } from 'lucide-react';
import { Avatar, Badge, Button, Card, Loader, RatingStars } from '../components/ui/index.js';
import BookmarkButton from '../features/saved/BookmarkButton.jsx';
import StartChatModal from '../features/conversations/StartChatModal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import InsightsPanel from '../features/insights/InsightsPanel.jsx';
import ReviewsSection from '../features/professionals/ReviewsSection.jsx';
import { fetchProfessional } from '../features/professionals/professionalsSlice.js';
import { selectUser } from '../features/auth/authSlice.js';
import { trackView, trackingOn } from '../lib/history.js';

export default function ProfessionalDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { item: pro, status, error } = useSelector((s) => s.professionals.detail);

  const user = useSelector(selectUser);
  const toast = useToast();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [messaging, setMessaging] = useState(false);
  const startMessage = () => (user ? setMessaging(true) : (toast.info('Log in to contact a professional.'), navigate('/login', { state: { from: routeLocation } })));
  useEffect(() => { dispatch(fetchProfessional(id)); }, [dispatch, id]);
  // Record the view for signed-in visitors (the server ignores it when they have turned history off).
  useEffect(() => { if (pro && trackingOn(user)) trackView(pro._id); }, [pro?._id, !!user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'failed') {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Professional not found</h1>
        <p className="mt-2 text-slate-500">{error}</p>
        <Link to="/professionals" className="mt-6 inline-block"><Button>Browse professionals</Button></Link>
      </div>
    );
  }
  if (!pro) return <Loader label="Loading profile…" fullPage />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link to="/professionals" className="mb-4 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" />All professionals</Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Avatar name={pro.fullName} src={pro.profileImage} size="h-24 w-24 text-3xl" />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold">{pro.fullName}</h1>
                  {pro.verificationStatus === 'verified'
                    ? <Badge tone="blue"><BadgeCheck className="mr-1 h-3.5 w-3.5" />Verified</Badge>
                    : <Badge tone="gray">Unverified</Badge>}
                </div>
                <p className="text-slate-600">{pro.title}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <RatingStars value={pro.averageRating} size="h-5 w-5" />
                  <span className="font-semibold">{pro.averageRating.toFixed(1)}</span>
                  <span className="text-slate-500">({pro.reviewCount} reviews)</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{pro.location}, {pro.country}</span>
                  <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" />{pro.yearsOfExperience} years of experience</span>
                  <Badge tone="blue">{pro.category}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 self-start"><Button onClick={startMessage}><MessageSquare className="h-4 w-4" />Contact</Button><BookmarkButton professionalId={pro._id} variant="button" /></div>
            </div>
          </Card>

          <Card title="About"><p className="text-sm leading-relaxed text-slate-700">{pro.description}</p></Card>
          <div className="grid gap-6 sm:grid-cols-2">
            <Card title="Specializations"><div className="flex flex-wrap gap-2">{pro.specializations.map((s) => <Badge key={s}>{s}</Badge>)}</div></Card>
            <Card title="Qualifications">
              <ul className="space-y-2 text-sm text-slate-700">{pro.qualifications.map((q) => <li key={q} className="flex gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{q}</li>)}</ul>
            </Card>
          </div>
          <Card title="Services offered"><ul className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">{pro.services.map((s) => <li key={s} className="rounded-lg bg-slate-50 px-3 py-2">{s}</li>)}</ul></Card>
          <div id="insights"><InsightsPanel professionalId={pro._id} /></div>
          <div id="reviews"><ReviewsSection professionalId={pro._id} /></div>
        </div>

        <aside>
          <Card title="Contact" className="lg:sticky lg:top-24">
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /><a className="break-all text-brand-600 hover:underline" href={`mailto:${pro.contactEmail}`}>{pro.contactEmail}</a></li>
              {pro.phone && <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /><a className="text-brand-600 hover:underline" href={`tel:${pro.phone}`}>{pro.phone}</a></li>}
              {pro.website && <li className="flex items-center gap-2"><Globe className="h-4 w-4 text-slate-400" /><span className="break-all text-slate-600">{pro.website}</span></li>}
            </ul>
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">Demo data: contact details are fictional placeholders.</p>
          </Card>
        </aside>
      </div>
      <StartChatModal open={messaging} professional={pro} onClose={() => setMessaging(false)} />
    </div>
  );
}
