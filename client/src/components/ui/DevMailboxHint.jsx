import { Link } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { useDevMailbox } from '../../lib/useDevMailbox.js';

// Shown only while the server runs its development-only mailbox (EMAIL_MODE=dev).
export default function DevMailboxHint({ email }) {
  if (!useDevMailbox()) return null;
  return (
    <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Development mode: no email provider is connected. Open the <Link className="font-semibold underline" to={`/dev/mailbox${email ? `?email=${encodeURIComponent(email)}` : ''}`}>development mailbox</Link> to see the message.</span>
    </p>
  );
}
