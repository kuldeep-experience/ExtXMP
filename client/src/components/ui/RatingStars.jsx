import { Star } from 'lucide-react';

export default function RatingStars({ value = 0, size = 'h-4 w-4' }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${value >= n - 0.25 ? 'fill-amber-400 text-amber-400' : value >= n - 0.75 ? 'fill-amber-200 text-amber-400' : 'text-slate-300'}`} />
      ))}
    </span>
  );
}
