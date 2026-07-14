import { supabase } from '../lib/supabase-client.js';

export async function updatePhone(repId, phone) {
  const { error } = await supabase.from('reps').update({ phone }).eq('id', repId);
  if (error) throw error;
}

export async function uploadPhoto(repId, file) {
  const path = `${repId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('rep-photos').upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from('rep-photos').getPublicUrl(path);
  const photo_url = data.publicUrl;
  const { error: updateError } = await supabase.from('reps').update({ photo_url }).eq('id', repId);
  if (updateError) throw updateError;
  return photo_url;
}

export async function fetchProfile(repId) {
  const { data, error } = await supabase.from('reps').select('phone, photo_url').eq('id', repId).single();
  if (error) throw error;
  return data;
}

window.RepProfile = { updatePhone, uploadPhoto, fetchProfile };
