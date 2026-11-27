import { useSearchParams } from 'react-router-dom';
import { History } from 'lucide-react';
import { PageHeader } from '../components/ui/index.js';
import ExperiencesTab from '../features/experience/ExperiencesTab.jsx';
import TimelineTab from '../features/experience/TimelineTab.jsx';
import ServiceRecordsTab from '../features/serviceRecords/ServiceRecordsTab.jsx';

const TABS = [['timeline', 'Timeline'], ['experiences', 'Experiences'], ['records', 'Service records']];

export default function ExperienceHistory() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'timeline';
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader icon={History} title="My Experience History" description="A private record of the professionals you have worked with: what happened and when, how it went, and the services they performed. None of it is published." />
      <div role="tablist" aria-label="Experience history sections" className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setParams(id === 'timeline' ? {} : { tab: id })}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
        ))}
      </div>
      {tab === 'timeline' && <TimelineTab key="t" />}
      {tab === 'experiences' && <ExperiencesTab key="e" />}
      {tab === 'records' && <ServiceRecordsTab key="r" />}
    </div>
  );
}
