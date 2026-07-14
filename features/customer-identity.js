import { supabase } from '../lib/supabase-client.js';

export async function getOrCreateCustomerId(name, area) {
  const { data, error } = await supabase.rpc('get_or_create_customer', { p_name: name, p_area: area || null });
  if (error) throw error;
  return data;
}

window.CustomerIdentity = { getOrCreateCustomerId };
