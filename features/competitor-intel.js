import { supabase } from '../lib/supabase-client.js';

export async function fetchLogs() {
  const { data, error } = await supabase
    .from('competitor_logs')
    .select('id, competitor_name, product, category, price, unit, customer_name, notes, photo_url, created_at, rep_id, reps(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createLog(entry) {
  const { data, error } = await supabase.from('competitor_logs').insert(entry).select().single();
  if (error) throw error;
  return data;
}

export async function uploadPhoto(repId, logId, file) {
  const path = `${repId}/${logId || Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('intel-photos').upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from('intel-photos').getPublicUrl(path);
  return data.publicUrl;
}

export async function updateLog(id, patch) {
  const { error } = await supabase.from('competitor_logs').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteLog(id) {
  const { error, count } = await supabase.from('competitor_logs').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  // A matching row exists but RLS silently excluded it from the delete
  // (not the log's own author, not a Super Admin) — Postgres reports this
  // as success with zero rows affected, not an error. Without this check
  // the UI would show a false "Entry deleted" toast and the row would
  // just reappear on the next refresh.
  if (!count) throw new Error("You don't have permission to delete this entry.");
}

window.CompetitorIntel = { fetchLogs, createLog, updateLog, deleteLog, uploadPhoto };
