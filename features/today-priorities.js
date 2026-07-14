import { supabase } from '../lib/supabase-client.js';

export async function fetchContactedKeys() {
  const { data, error } = await supabase.from('customer_contacts').select('customers(normalized_key)');
  if (error) throw error;
  return [...new Set(data.map(r => r.customers?.normalized_key).filter(Boolean))];
}

export async function fetchLastVisitByKey() {
  const { data, error } = await supabase.from('customer_visits').select('created_at, customers(normalized_key)');
  if (error) throw error;
  const map = {};
  data.forEach(r => {
    const key = r.customers?.normalized_key;
    if (key && (!map[key] || r.created_at > map[key])) map[key] = r.created_at;
  });
  return map;
}

window.TodayPriorities = { fetchContactedKeys, fetchLastVisitByKey };
