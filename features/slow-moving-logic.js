// Pure logic for Intel → Slow-Moving Products. No imports, no DOM, no network —
// kept separate from features/slow-moving.js so scripts/test-slow-moving.mjs
// can import it under plain Node.

// Single source of truth for the answer options. `fields` = the conditional
// inputs shown for that answer. `tone` only drives chip colour.
export const FEEDBACK_OPTIONS = [
  { value: 'interested',      label: 'Interested',             tone: 'good',    fields: ['estimated_monthly_volume', 'target_purchase_date'] },
  { value: 'needs_sample',    label: 'Needs sample',           tone: 'good',    fields: ['sample_requirements', 'followup_required'] },
  { value: 'price_too_high',  label: 'Price too high',         tone: 'warn',    fields: ['target_price', 'explanation'] },
  { value: 'packaging_issue', label: 'Packaging issue',        tone: 'warn',    fields: ['requested_packaging', 'explanation'] },
  { value: 'uses_competitor', label: 'Already using competitor', tone: 'warn',  fields: ['competitor_brand', 'explanation'] },
  { value: 'not_interested',  label: 'Not interested',         tone: 'bad',     fields: ['rejection_reason'] },
  { value: 'not_applicable',  label: 'Not applicable',         tone: 'neutral', fields: ['not_applicable_reason'] },
  { value: 'not_familiar',    label: 'Not familiar with product', tone: 'neutral', fields: ['education_opportunity'] },
];

export const FIELD_DEFS = {
  estimated_monthly_volume: { label: 'Est. monthly volume (units)', type: 'number' },
  target_purchase_date:     { label: 'Target purchase date',        type: 'date' },
  sample_requirements:      { label: 'Sample requirements',         type: 'text' },
  followup_required:        { label: 'Follow-up required',          type: 'bool' },
  target_price:             { label: 'Target price (Rp)',           type: 'number' },
  explanation:              { label: 'Explanation (optional)',      type: 'text' },
  requested_packaging:      { label: 'Requested packaging size',    type: 'text' },
  competitor_brand:         { label: 'Competitor brand',            type: 'text' },
  rejection_reason:         { label: 'Reason for rejection',        type: 'text' },
  not_applicable_reason:    { label: 'Why not applicable',          type: 'text' },
  education_opportunity:    { label: 'Product info or a sample could create an opportunity', type: 'bool' },
};

export const optionOf = status => FEEDBACK_OPTIONS.find(o => o.value === status) || null;

// Answered = has a status. "Not applicable" is a valid answer (never confused
// with "not interested"); only an empty status is missing.
export function progress(items) {
  const total = items.length;
  const done = items.filter(i => i.feedback_status).length;
  return { done, total };
}

export function canComplete(items) {
  const { done, total } = progress(items);
  return total > 0 && done === total;
}

// Choosing a status resets every conditional field that doesn't belong to it,
// so a rep who changes "Price too high" → "Interested" doesn't leave a stale
// target price behind. customer_comment is kept (it applies to any answer).
export function patchForStatus(status) {
  const keep = new Set(optionOf(status)?.fields || []);
  const patch = { feedback_status: status };
  for (const [name, def] of Object.entries(FIELD_DEFS)) {
    if (keep.has(name)) continue;
    patch[name] = def.type === 'bool' ? (name === 'followup_required' ? false : null) : null;
  }
  return patch;
}

// Form input → DB value. Empty → null; numbers must be finite and >= 0.
export function normalizeValue(type, raw) {
  if (type === 'bool') return !!raw;
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  if (type === 'number') {
    const n = Number(s.replace(/,/g, '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return s;
}

// Counts by status for the completion summary.
export function summarize(items) {
  const out = {};
  for (const o of FEEDBACK_OPTIONS) out[o.value] = 0;
  for (const i of items) if (i.feedback_status in out) out[i.feedback_status]++;
  return out;
}
