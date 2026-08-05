import { supabase } from '../lib/supabase-client.js';

export async function fetchAnnouncements() {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, message, category, created_at, target_rep_id, reps!announcements_author_rep_id_fkey(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createAnnouncement(entry) {
  const { error } = await supabase.from('announcements').insert(entry);
  if (error) throw error;
}

// lib/app-core.js is a classic global-scope script, not a module — it can't
// import the supabase client directly, so a targeted send needs this bridge
// to resolve a rep's id from their name (Manager only knows their own
// repId from login, not other reps').
export async function resolveRepIdByName(name) {
  const { data, error } = await supabase.from('reps').select('id').eq('name', name).single();
  if (error || !data) throw new Error('Could not resolve recipient');
  return data.id;
}

// Super Admin only — RLS-gated (0014_super_admin_full_moderation.sql).
// No policy for regular Managers to delete their own; announcements stay
// append-only for everyone except this moderation override.
export async function deleteAnnouncement(id) {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
}

window.Announcements = { fetchAnnouncements, createAnnouncement, resolveRepIdByName, deleteAnnouncement };
