import { Loader2 } from 'lucide-react';

export default function Loader({ label = 'Loading…', fullPage = false }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-slate-500 ${fullPage ? 'min-h-[60vh]' : 'py-8'}`} role="status">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
