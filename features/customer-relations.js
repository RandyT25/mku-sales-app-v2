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

// Manager-facing directory — every contact across every customer, not scoped
// to one customer_id like fetchContacts() above.
export async function fetchAllContacts() {
  const { data, error } = await supabase
    .from('customer_contacts')
    .select('id, name, role, phone, customer_id, customers(name, area)')
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
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

// Super Admin only — RLS-gated (0014_super_admin_full_moderation.sql).
// Regular reps still can't edit/delete visit notes at all (append-only by
// design — "a visit note is a historical record"), this is a moderation
// override, not a new general capability.
// {count:'exact'} + the zero-rows check matches deleteLog()'s pattern
// (features/competitor-intel.js) — an RLS-blocked write reports success
// with 0 rows affected rather than an error, which would otherwise show a
// false "saved"/"deleted" toast while the row silently didn't change.
export async function updateVisit(id, note) {
  const { error, count } = await supabase.from('customer_visits').update({ note }, { count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (!count) throw new Error("You don't have permission to edit this entry.");
}

export async function deleteVisit(id) {
  const { error, count } = await supabase.from('customer_visits').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (!count) throw new Error("You don't have permission to delete this entry.");
}

window.CustomerRelations = {
  fetchContacts, createContact, updateContact, deleteContact,
  fetchVisits, createVisit, updateVisit, deleteVisit, fetchAllContacts,
};
