import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X, BadgeCheck } from 'lucide-react';
import { useSelector } from 'react-redux';
import { Button } from '../ui/index.js';

const nav = [
  { to: '/professionals', label: 'Find a professional' },
  { to: '/#how-it-works', label: 'How it works', hash: true },
];

function NavItem({ item, className, onClick }) {
  return item.hash
    ? <a href={item.to} onClick={onClick} className={className}>{item.label}</a>
    : <Link to={item.to} onClick={onClick} className={className}>{item.label}</Link>;
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><BadgeCheck className="h-5 w-5" /></span>
      <span>Experience<span className="text-brand-600">.com</span></span>
    </Link>
  );
}

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const user = useSelector((s) => s.auth.user);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-6 md:flex">
            {nav.map((n) => <NavItem key={n.to} item={n} className="text-sm font-medium text-slate-600 hover:text-brand-600" />)}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {user ? <Link to="/dashboard"><Button>My dashboard</Button></Link> : <>
              <Link to="/login"><Button variant="ghost">Log in</Button></Link>
              <Link to="/register"><Button>Sign up</Button></Link>
            </>}
          </div>
          <button className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <div className="space-y-1 border-t border-slate-200 px-4 py-3 md:hidden">
            {nav.map((n) => <NavItem key={n.to} item={n} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" />)}
            {user ? <NavLink to="/dashboard" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50">My dashboard</NavLink> : <>
              <NavLink to="/login" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">Log in</NavLink>
              <NavLink to="/register" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50">Sign up</NavLink>
            </>}
          </div>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <p>© {new Date().getFullYear()} Experience.com Visitor Platform — proof of concept.</p>
        </div>
      </footer>
    </div>
  );
}
