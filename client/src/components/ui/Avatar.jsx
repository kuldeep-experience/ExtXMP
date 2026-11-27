import { useState } from 'react';

export default function Avatar({ name, src, size = 'h-16 w-16 text-xl' }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return src && !broken ? (
    <img src={src} alt={name} onError={() => setBroken(true)} className={`${size} shrink-0 rounded-2xl object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-2xl bg-brand-100 font-semibold text-brand-700`}>{initials}</span>
  );
}
