import { supabase } from './supabase-client.js';
import { deriveLoginAlias } from './rep-alias.js';

const REP_SELECT = 'id, name, is_manager, is_nestle, active, auth_user_id';

export async function login(repName, pin) {
  const email = deriveLoginAlias(repName);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pin });
  if (error) throw { code: 'bad_pin', raw: error };

  const { data: repRow, error: repErr } = await supabase
    .from('reps')
    .select(REP_SELECT)
    .eq('name', repName)
    .single();

  if (repErr || !repRow || !repRow.active || repRow.auth_user_id !== data.user.id) {
    await supabase.auth.signOut();
    throw { code: 'no_rep_row', raw: repErr };
  }
  return repRow;
}

export async function logout() {
  try { await supabase.auth.signOut(); } catch (e) { console.warn('signOut failed', e); }
}

export async function restoreSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: repRow, error } = await supabase
    .from('reps')
    .select(REP_SELECT)
    .eq('auth_user_id', session.user.id)
    .single();

  if (error || !repRow || !repRow.active) {
    await supabase.auth.signOut();
    return null;
  }
  return repRow;
}

window.AppAuth = { login, logout, restoreSession };
