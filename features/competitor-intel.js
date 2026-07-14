import { supabase } from '../lib/supabase-client.js';

export async function fetchLogs() {
  const { data, error } = await supabase
    .from('competitor_logs')
    .select('id, competitor_name, product, category, price, unit, customer_name, notes, created_at, rep_id, reps(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createLog(entry) {
  const { error } = await supabase.from('competitor_logs').insert(entry);
  if (error) throw error;
}

window.CompetitorIntel = { fetchLogs, createLog };
