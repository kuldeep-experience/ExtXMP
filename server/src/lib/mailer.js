import { env } from '../config/env.js';
import DevEmail from '../models/DevEmail.js';

// No real email provider is integrated. In EMAIL_MODE=dev messages go to a local dev-only outbox
// (and the server console). In production nothing is sent until a provider is added here.
export async function sendMail({ to, subject, text, link }) {
  if (env.EMAIL_MODE === 'dev') {
    await DevEmail.create({ to, subject, text, link });
    console.log(`[DEV EMAIL - not delivered] to=${to} subject="${subject}" link=${link}`);
    return;
  }
  console.warn(`[mail] No email provider configured; "${subject}" for ${to} was not sent.`);
}
