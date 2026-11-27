import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatches, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Bookmark, Clock, Compass, History, LayoutDashboard, Lightbulb, LogOut, Menu, MessageSquare, Settings, SlidersHorizontal, Sparkles, UserRound, X } from 'lucide-react';
import { Logo } from './PublicLayout.jsx';
import { Avatar, Dropdown } from '../ui/index.js';
import { logout } from '../../features/auth/authSlice.js';
import { fetchUnread } from '../../features/conversations/conversationsSlice.js';

export const dashboardNav = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/discover', label: 'Discovery', icon: Compass },
  { to: '/dashboard/saved', label: 'Saved Professionals', icon: Bookmark },
  { to: '/dashboard/contacts', label: 'My Contacts', icon: MessageSquare, unread: true },
  { to: '/dashboard/experience-history', label: 'Experience History', icon: History },
  { to: '/dashboard/search-preferences', label: 'Search Preferences', icon: SlidersHorizontal },
  { to: '/dashboard/ai-assistant', label: 'AI Assistant', icon: Sparkles },
  { to: '/dashboard/recently-viewed', label: 'Recently Viewed', icon: Clock },
  { to: '/dashboard/settings', label: 'Account Settings', icon: Settings },
];
export const dashboardMore = [
  { to: '/dashboard/review-insights', label: 'Review Insights', icon: Lightbulb },
  { to: '/dashboard/profile', label: 'My Profile', icon: UserRound },
];

const linkClass = ({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;

export default function DashboardLayout() {
  const [open, setOpen] = useState(false);
  const user = useSelector((s) => s.auth.user);
  const unread = useSelector((s) => s.conversations.unread);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const matches = useMatches();
  const title = [...matches].reverse().find((m) => m.handle?.title)?.handle.title ?? 'Dashboard';

  useEffect(() => { setOpen(false); }, [pathname]); // close the drawer after navigating
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden'; // no background scrolling behind the drawer
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => { dispatch(fetchUnread()); }, [dispatch, pathname]);
  const doLogout = async () => { await dispatch(logout()); navigate('/login', { replace: true }); };
  const item = ({ to, label, icon: Icon, end, unread: showUnread }) => (
    <NavLink key={to} to={to} end={end} className={linkClass}>
      <Icon className="h-4 w-4 shrink-0" /><span className="flex-1 truncate">{label}</span>
      {showUnread && unread > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white" aria-label={`${unread} unread messages`}>{unread}</span>}
    </NavLink>
  );
  const sidebar = (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-4" aria-label="Dashboard">
      {dashboardNav.map(item)}
      <p className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">More</p>
      {dashboardMore.map(item)}
      <button onClick={doLogout} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Log out</button>
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[16rem_1fr]">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
      <aside className="hidden border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-16 shrink-0 items-center border-b border-slate-200 px-4"><Logo /></div>
        <div className="min-h-0 flex-1">{sidebar}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4"><Logo /><button onClick={() => setOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <div className="min-h-0 flex-1">{sidebar}</div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}><Menu className="h-5 w-5" /></button>
          <div className="lg:hidden"><Logo /></div>
          <h2 className="hidden truncate text-sm font-semibold text-slate-700 lg:block">{title}</h2>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/professionals" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 sm:block">Browse professionals</Link>
            <Dropdown
              trigger={<span className="flex items-center gap-2"><Avatar name={`${user.firstName} ${user.lastName}`} src={user.profileImage} size="h-8 w-8 text-xs" /><span className="hidden max-w-32 truncate sm:inline">{user.firstName}</span></span>}
              items={[{ label: 'My Profile', icon: UserRound, onClick: () => navigate('/dashboard/profile') }, { label: 'Account Settings', icon: Settings, onClick: () => navigate('/dashboard/settings') }, { label: 'Log out', icon: LogOut, onClick: doLogout }]}
            />
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
