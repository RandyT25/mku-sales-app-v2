import { supabase } from '../lib/supabase-client.js';

export async function fetchContacts(customerId) {
  const { data, error } = await supabase
    .from('customer_contacts')
    .select('id, name, role, phone, created_at, rep_id, reps(name)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createContact(entry) {
  const { error } = await supabase.from('customer_contacts').insert(entry);
  if (error) throw error;
}

export async function updateContact(id, fields) {
  const { error } = await supabase.from('customer_contacts').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteContact(id) {
  const { error } = await supabase.from('customer_contacts').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchVisits(customerId) {
  const { data, error } = await supabase
    .from('customer_visits')
    .select('id, note, created_at, rep_id, reps(name)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createVisit(entry) {
  const { error } = await supabase.from('customer_visits').insert(entry);
  if (error) throw error;
}

window.CustomerRelations = { fetchContacts, createContact, updateContact, deleteContact, fetchVisits, createVisit };
