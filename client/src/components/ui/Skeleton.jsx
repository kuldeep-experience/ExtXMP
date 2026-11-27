// Placeholder shapes shown while data loads. They keep the layout stable and are hidden from screen readers.
export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

export function CardSkeleton({ lines = 3 }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" role="status" aria-label="Loading">
      <div className="flex gap-3"><Skeleton className="h-12 w-12 !rounded-2xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div></div>
      <div className="mt-4 space-y-2">{Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-1/3' : 'w-full'}`} />)}</div>
    </div>
  );
}

export function ListSkeleton({ count = 3, className = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' }) {
  return <div className={className}>{Array.from({ length: count }, (_, i) => <CardSkeleton key={i} />)}</div>;
}
