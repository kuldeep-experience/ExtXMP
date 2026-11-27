import { CalendarDays, Clock, Pencil, Play, Trash2 } from 'lucide-react';
import { Badge, Button, Card } from '../../components/ui/index.js';
import { criteriaChips } from './criteria.js';

const fmt = (d) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export default function SearchCard({ search, onRun, onEdit, onDelete, running }) {
  return (
    <Card className="flex h-full flex-col">
      <h3 className="text-base font-semibold text-slate-900">{search.name}</h3>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {criteriaChips(search).map((c, i) => <Badge key={i} tone={i === 0 ? 'blue' : 'gray'}>{c}</Badge>)}
      </div>
      <div className="mt-auto pt-4">
        <p className="flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />Created {fmt(search.createdAt)}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" />{search.lastUsedAt ? `Last used ${fmt(search.lastUsedAt)}` : 'Never used'}</p>
        <div className="mt-4 flex items-center gap-2">
          <Button className="flex-1" onClick={() => onRun(search)} loading={running}><Play className="h-4 w-4" />Run search</Button>
          <Button variant="secondary" onClick={() => onEdit(search)} aria-label={`Edit ${search.name}`} title="Edit"><Pencil className="h-4 w-4" /></Button>
          <button onClick={() => onDelete(search)} aria-label={`Delete ${search.name}`} title="Delete" className="rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-5 w-5" /></button>
        </div>
      </div>
    </Card>
  );
}
