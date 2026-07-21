import { supabase } from './supabase-client.js';
import { deriveLoginAlias } from './rep-alias.js';

const REP_SELECT = 'id, name, is_manager, is_nestle, active, auth_user_id, must_change_pin, phone, photo_url';

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

export async function changePin(newPin) {
  const { error } = await supabase.auth.updateUser({ password: newPin });
  // A rep who already has a real (non-placeholder) PIN will naturally type
  // that same PIN again here — Supabase correctly refuses to "change" a
  // password to its current value, but that's not a failure from the rep's
  // point of view: they're keeping the PIN they already have. Only a
  // genuine error should block them from clearing must_change_pin.
  const isSamePinError = error && /different from the old password/i.test(error.message || '');
  if (error && !isSamePinError) throw { code: 'change_pin_failed', raw: error };
  const { error: rpcError } = await supabase.rpc('mark_pin_changed');
  if (rpcError) throw { code: 'mark_pin_changed_failed', raw: rpcError };
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

  // Only sign out when we have a definitive answer that this session doesn't
  // belong to an active rep. A transient error (network blip, timeout —
  // likely right after the phone wakes from lock) is not proof of that, and
  // signing out on one destroys an otherwise-good session for no reason.
  const repDefinitelyInvalid = (!error && (!repRow || !repRow.active)) || error?.code === 'PGRST116';
  if (repDefinitelyInvalid) {
    await supabase.auth.signOut();
    return null;
  }
  if (error) {
    console.error('restoreSession: transient error, keeping session', error);
    return null;
  }
  return repRow;
}

window.AppAuth = { login, logout, restoreSession, changePin };
