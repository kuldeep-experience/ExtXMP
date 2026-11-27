import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { Button, Card, Input, Loader } from '../components/ui/index.js';
import { api, errorMessage } from '../lib/api.js';
import { useDevMailbox } from '../lib/useDevMailbox.js';

// DEVELOPMENT ONLY: reads the server's local outbox. Not routed in production builds.
export default function DevMailbox() {
  const enabled = useDevMailbox();
  const [params, setParams] = useSearchParams();
  const email = params.get('email') || '';
  const [input, setInput] = useState(email);
  const [state, setState] = useState({ status: 'idle', items: [], error: null });

  useEffect(() => {
    if (!email || !enabled) return;
    setState((s) => ({ ...s, status: 'loading' }));
    api.get('/dev/emails', { params: { to: email } })
      .then((r) => setState({ status: 'ok', items: r.data.data, error: null }))
      .catch((e) => setState({ status: 'failed', items: [], error: errorMessage(e) }));
  }, [email, enabled]);

  if (!enabled) return <p className="p-10 text-center text-sm text-slate-500">The development mailbox is not enabled on this server.</p>;

  const toPath = (link) => { const u = new URL(link); return u.pathname + u.search; };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
        <p><strong>Development mailbox.</strong> No email provider is connected, so verification and password-reset emails are stored locally instead of being delivered. This page and its API do not exist in production.</p>
      </div>
      <form className="mb-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); setParams(input ? { email: input.trim() } : {}); }}>
        <Input className="flex-1" type="email" placeholder="Email address to look up" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Email address" />
        <Button type="submit">Look up</Button>
      </form>
      {state.status === 'loading' && <Loader />}
      {state.status === 'failed' && <p className="text-sm text-red-600">{state.error}</p>}
      {state.status === 'ok' && state.items.length === 0 && <p className="text-sm text-slate-500">No messages for {email}.</p>}
      <div className="space-y-3">
        {state.items.map((m) => (
          <Card key={m._id} title={m.subject}>
            <p className="text-sm text-slate-600">{m.text}</p>
            <Link to={toPath(m.link)} className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">Open link →</Link>
            <p className="mt-2 text-xs text-slate-400">{new Date(m.createdAt).toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
