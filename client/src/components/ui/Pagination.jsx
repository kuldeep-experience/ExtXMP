import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './Button.jsx';

export function pageWindow(page, total, size = 5) {
  const start = Math.max(1, Math.min(page - Math.floor(size / 2), total - size + 1));
  return Array.from({ length: Math.min(size, total) }, (_, i) => start + i);
}

export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
      {pageWindow(page, totalPages).map((n) => (
        <Button key={n} size="sm" variant={n === page ? 'primary' : 'ghost'} aria-current={n === page ? 'page' : undefined} onClick={() => onChange(n)}>{n}</Button>
      ))}
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
    </nav>
  );
}
