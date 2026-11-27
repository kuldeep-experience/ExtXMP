import { useId } from 'react';

export default function Input({ label, error, icon: Icon, className = '', ...props }) {
  const id = useId();
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>}
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
        <input
          id={id}
          aria-invalid={!!error}
          className={`w-full rounded-xl border bg-white py-2.5 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 ${Icon ? 'pl-10' : 'pl-3'} ${error ? 'border-red-400' : 'border-slate-300'}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
