import { supabase } from '../lib/supabase-client.js';

const ITEM_COLS = 'id, session_id, product_id, feedback_status, customer_comment, explanation, target_price, requested_packaging, competitor_brand, estimated_monthly_volume, target_purchase_date, sample_requirements, followup_required, not_applicable_reason, rejection_reason, education_opportunity, slow_moving_products(product_name, packaging, display_order)';

// Starts the caller's assessment for a customer, or resumes their open draft.
// The server derives the rep from the session and creates the visit + items.
export async function startAssessment(customerId) {
  const { data, error } = await supabase.rpc('start_product_assessment', { p_customer_id: customerId });
  if (error) throw error;
  return data; // session id
}

// Active products, used to show a blank assessment before any server draft exists.
export async function fetchActiveProducts() {
  const { data, error } = await supabase
    .from('slow_moving_products').select('id, product_name, packaging, display_order')
    .eq('active', true).order('display_order');
  if (error) throw error;
  return data;
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

// Supabase caps a response at 1000 rows; a completed assessment is 8 rows, so
// the facts view outgrows that after ~125 assessments — page through it.
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

// Management dashboard inputs: every completed answer + every session (for completion rates).
export const fetchFacts = () => fetchAll(() =>
  supabase.from('slow_moving_item_facts').select('*').order('completed_at', { ascending: false }).order('item_id'));
export const fetchSessions = () => fetchAll(() =>
  supabase.from('product_assessment_sessions').select('id, customer_id, rep_id, assessment_status, reps(name)').order('id'));

// PostgREST says PGRST202 (function) / PGRST205 (table) when migration 0017 isn't live.
export const isNotSetUp = e => ['PGRST202', 'PGRST205', '42P01'].includes(e?.code);

window.SlowMoving = { startAssessment, fetchActiveProducts, fetchItems, fetchMyDrafts, saveItem, completeAssessment, fetchFacts, fetchSessions, isNotSetUp };
