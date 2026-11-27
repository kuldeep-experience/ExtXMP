import { useEffect, useState } from 'react';
import { api } from './api.js';

// The server reports whether its development-only mailbox is active (EMAIL_MODE=dev).
let cached;
export function useDevMailbox() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    cached ||= api.get('/health').then((r) => !!r.data.devMailbox).catch(() => false);
    cached.then(setEnabled);
  }, []);
  return enabled;
}
