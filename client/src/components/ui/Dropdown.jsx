import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// items: [{ label, onClick, icon? }]
export default function Dropdown({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
        {trigger}<ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className={`absolute z-40 mt-1 min-w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {items.map(({ label, onClick, icon: Icon }) => (
            <button key={label} role="menuitem" onClick={() => { setOpen(false); onClick(); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100">
              {Icon && <Icon className="h-4 w-4" />}{label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
