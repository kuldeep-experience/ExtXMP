import { Link } from 'react-router-dom';
import { Skeleton } from './Skeleton.jsx';

export default function StatCard({ icon: Icon, label, value, to, loading }) {
  const body = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        {loading ? <Skeleton className="h-6 w-10" /> : <p className="text-2xl font-bold text-slate-900">{value}</p>}
        <p className="truncate text-xs text-slate-500">{label}</p>
      </div>
    </>
  );
  const cls = 'flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
  return to ? <Link to={to} className={`${cls} transition hover:border-brand-200 hover:shadow-md`}>{body}</Link> : <div className={cls}>{body}</div>;
}
