// Manager/Super-Admin privileged actions that need a server-side key —
// bridges to Edge Functions the same way lib/dashboard-data.js does (raw
// fetch with a bearer token, not supabase.functions.invoke, for consistency
// with the one other function in this project).
import { supabase } from '../lib/supabase-client.js';

const RESET_PIN_URL = 'https://hwgrswtahduyqxfokbwj.supabase.co/functions/v1/reset-rep-pin';

export async function resetRepPin(targetRepId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('no session');
  const resp = await fetch(RESET_PIN_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetRepId }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'reset failed');
  return data; // { tempPin }
}

window.AdminActions = { resetRepPin };
