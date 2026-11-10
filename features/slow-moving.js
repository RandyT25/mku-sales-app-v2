import { supabase } from '../lib/supabase-client.js';

const ITEM_COLS = 'id, session_id, product_id, feedback_status, customer_comment, explanation, target_price, requested_packaging, competitor_brand, estimated_monthly_volume, target_purchase_date, sample_requirements, followup_required, not_applicable_reason, rejection_reason, education_opportunity, slow_moving_products(product_name, packaging, display_order)';

// Starts the caller's assessment for a customer, or resumes their open draft.
// The server derives the rep from the session and creates the visit + items.
export async function startAssessment(customerId) {
  const { data, error } = await supabase.rpc('start_product_assessment', { p_customer_id: customerId });
  if (error) throw error;
  return data; // session id
}

export async function fetchItems(sessionId) {
  const { data, error } = await supabase
    .from('product_assessment_items').select(ITEM_COLS).eq('session_id', sessionId);
  if (error) throw error;
  return data.sort((a, b) => a.slow_moving_products.display_order - b.slow_moving_products.display_order);
}

// The caller's own open drafts, for the "Resume" list.
export async function fetchMyDrafts() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me, error: meErr } = await supabase.from('reps').select('id').eq('auth_user_id', user.id).single();
  if (meErr) throw meErr;
  const { data, error } = await supabase
    .from('product_assessment_sessions')
    .select('id, customers(name, area), product_assessment_items(feedback_status)')
    .eq('rep_id', me.id).eq('assessment_status', 'draft')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function saveItem(id, patch) {
  const { error, count } = await supabase
    .from('product_assessment_items').update(patch, { count: 'exact' }).eq('id', id);
  if (error) throw error;
  // RLS excludes completed/other people's items silently (0 rows, no error).
  if (!count) throw new Error('This assessment can no longer be edited.');
}

export async function completeAssessment(sessionId) {
  const { error } = await supabase.rpc('complete_product_assessment', { p_session_id: sessionId });
  if (error) throw error;
}

window.SlowMoving = { startAssessment, fetchItems, fetchMyDrafts, saveItem, completeAssessment };
