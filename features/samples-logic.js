// Pure logic for Intel → Samples. No imports/DOM/network so scripts/test-samples.mjs runs under plain Node.
export const STATUS_LABEL = { requested: 'Requested', sent: 'Sent', feedback: 'Feedback', done: 'Done', cancelled: 'Cancelled' };
export const RESULT_LABEL = { positive: 'Positive', negative: 'Negative', order_placed: 'Order placed' };
export const OPEN = ['requested', 'sent', 'feedback'];

const pad = n => String(n).padStart(2, '0');
export const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local date
export const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };

// Only requested/sent have a "do something by" date; feedback just waits to be closed.
export const isOverdue = (s, today) => ['requested', 'sent'].includes(s.status) && !!s.followup_due && s.followup_due < today;
export const isDueToday = (s, today) => ['requested', 'sent'].includes(s.status) && s.followup_due === today;

// Open first (overdue → soonest due → no date), closed last (newest first).
export function sortSamples(list, today) {
  const rank = s => !OPEN.includes(s.status) ? 3 : isOverdue(s, today) ? 0 : s.followup_due ? 1 : 2;
  return list.slice().sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 3 ? (b.created_at || '').localeCompare(a.created_at || '') : (a.followup_due || '9').localeCompare(b.followup_due || '9')));
}

// Patch for the next step; `result` only for sent → feedback.
export function stepPatch(s, action, today, nowIso) {
  if (action === 'sent' && s.status === 'requested') return { status: 'sent', sent_at: nowIso, followup_due: addDays(today, 3) };
  if (action in RESULT_LABEL && s.status === 'sent') return { status: 'feedback', feedback_result: action, followup_due: null };
  if (action === 'done' && s.status === 'feedback') return { status: 'done' };
  if (action === 'cancelled' && OPEN.includes(s.status)) return { status: 'cancelled' };
  return null;
}

// Slow-Moving "needs sample" facts not yet turned into a sample request.
export const unlinkedNeedsSample = (facts, samples) => {
  const linked = new Set(samples.map(s => s.source_item_id).filter(Boolean));
  return facts.filter(f => f.feedback_status === 'needs_sample' && !linked.has(f.item_id));
};

export const dueCount = (list, repId, today) =>
  list.filter(s => s.rep_id === repId && (isOverdue(s, today) || isDueToday(s, today))).length;
