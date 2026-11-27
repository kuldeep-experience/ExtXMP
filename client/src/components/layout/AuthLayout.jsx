import { Link } from 'react-router-dom';
import { Logo } from './PublicLayout.jsx';
import { Card } from '../ui/index.js';

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <Logo />
      <Card className="mt-6 w-full max-w-md p-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </Card>
      <p className="mt-4 text-sm text-slate-500">{footer}</p>
      <Link to="/" className="mt-2 text-sm text-brand-600 hover:underline">← Back to home</Link>
    </div>
  );
}
