import { supabase } from '../lib/supabase-client.js';

export async function fetchDeals() {
  const { data, error } = await supabase
    .from('deals')
    .select('id, product_id, product_name, customer_name, quantity, agreed_price, discount_note, reason, status, created_at, updated_at, rep_id, reps(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createDeal(entry) {
  const { data, error } = await supabase.from('deals').insert(entry).select().single();
  if (error) throw error;
  return data;
}

export async function updateDealStatus(id, status) {
  const { error, count } = await supabase.from('deals').update({ status, updated_at: new Date().toISOString() }, { count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (!count) throw new Error("You don't have permission to update this deal.");
}

export async function deleteDeal(id) {
  const { error, count } = await supabase.from('deals').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (!count) throw new Error("You don't have permission to delete this deal.");
}

window.Deals = { fetchDeals, createDeal, updateDealStatus, deleteDeal };
