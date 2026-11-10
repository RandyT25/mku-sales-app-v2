// Pure dashboard maths for Intel → Slow-Moving Products. No DOM/network.
//
// Metric definitions (also shown in the dashboard UI):
//   Assessed   = completed answers EXCLUDING "Not applicable".
//   Share %    = status count ÷ Assessed. "Not applicable" never enters a
//                denominator (it is shown as a share of all responses instead).
//   Completion = completed sessions ÷ all started sessions (drafts included).
//   Detail     = of a rep's actionable answers (anything but N/A / not familiar),
//                the share that carry at least one detail field or a comment.
import { FEEDBACK_OPTIONS } from './slow-moving-logic.js';

export const STATUSES = FEEDBACK_OPTIONS.map(o => o.value);
const ASSESSED_STATUSES = STATUSES.filter(s => s !== 'not_applicable');
const ACTIONABLE = ['interested', 'needs_sample', 'price_too_high', 'packaging_issue', 'uses_competitor', 'not_interested'];
const DETAIL_FIELDS = ['customer_comment', 'explanation', 'target_price', 'requested_packaging', 'competitor_brand',
  'estimated_monthly_volume', 'target_purchase_date', 'sample_requirements', 'rejection_reason'];

export const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

const emptyCounts = () => Object.fromEntries(STATUSES.map(s => [s, 0]));
function countStatuses(rows) {
  const c = emptyCounts();
  for (const r of rows) if (r.feedback_status in c) c[r.feedback_status]++;
  return c;
}
const hasValue = v => v !== null && v !== undefined && String(v).trim() !== '';
const hasDetail = r => DETAIL_FIELDS.some(f => hasValue(r[f]));

function topCounts(values, limit = 5) {
  const m = new Map();
  for (const raw of values) {
    if (!hasValue(raw)) continue;
    const key = String(raw).trim().toLowerCase();
    const cur = m.get(key) || { label: String(raw).trim(), count: 0 };
    cur.count++; m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, limit);
}

export function computeMetrics(facts, sessions) {
  const done = sessions.filter(s => s.assessment_status === 'completed');
  const counts = countStatuses(facts);
  const assessedItems = facts.length - counts.not_applicable;

  const overall = {
    completedSessions: done.length,
    customersAssessed: new Set(done.map(s => s.customer_id)).size,
    completionRate: pct(done.length, sessions.length),
    assessedItems, counts,
  };

  // per product
  const byProduct = new Map();
  for (const f of facts) {
    if (!byProduct.has(f.product_id)) byProduct.set(f.product_id, { product_id: f.product_id, name: f.product_name, packaging: f.packaging, order: f.display_order, rows: [] });
    byProduct.get(f.product_id).rows.push(f);
  }
  const products = [...byProduct.values()].map(p => {
    const c = countStatuses(p.rows), assessed = p.rows.length - c.not_applicable;
    const share = {};
    for (const s of ASSESSED_STATUSES) share[s] = pct(c[s], assessed);
    return { product_id: p.product_id, name: p.name, packaging: p.packaging, order: p.order,
      responses: p.rows.length, assessed, counts: c, share, naShare: pct(c.not_applicable, p.rows.length) };
  }).sort((a, b) => a.order - b.order);

  // per salesperson — completeness and information quality, not just positives
  const reps = new Map();
  const rep = (id, name) => { if (!reps.has(id)) reps.set(id, { rep_id: id, name: name || '—', started: 0, completed: 0, customers: new Set(), interested: 0, samples: 0, followups: 0, actionable: 0, detailed: 0 }); return reps.get(id); };
  for (const s of sessions) {
    const r = rep(s.rep_id, s.reps?.name); r.started++;
    if (s.assessment_status === 'completed') { r.completed++; r.customers.add(s.customer_id); }
  }
  for (const f of facts) {
    const r = rep(f.rep_id, f.rep_name);
    if (f.feedback_status === 'interested') r.interested++;
    if (f.feedback_status === 'needs_sample') r.samples++;
    if (f.followup_required) r.followups++;
    if (ACTIONABLE.includes(f.feedback_status)) { r.actionable++; if (hasDetail(f)) r.detailed++; }
  }
  const salespeople = [...reps.values()].map(r => ({
    rep_id: r.rep_id, name: r.name, started: r.started, completed: r.completed,
    completionRate: pct(r.completed, r.started), customers: r.customers.size,
    interested: r.interested, samples: r.samples, followups: r.followups,
    detailRate: pct(r.detailed, r.actionable),
  })).sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name));

  // market insights
  const withAssessed = products.filter(p => p.assessed > 0);
  const byInterest = [...withAssessed].sort((a, b) => b.share.interested - a.share.interested || b.assessed - a.assessed);
  const insights = {
    objections: ['price_too_high', 'packaging_issue', 'uses_competitor', 'not_interested']
      .map(s => ({ status: s, count: counts[s], share: pct(counts[s], assessedItems) }))
      .filter(o => o.count).sort((a, b) => b.count - a.count),
    packaging: topCounts(facts.map(f => f.requested_packaging)),
    competitors: topCounts(facts.map(f => f.competitor_brand)),
    highInterest: byInterest.slice(0, 3),
    lowDemand: byInterest.slice(3).slice(-3).reverse(), // worst first; never overlaps highInterest
    pricingIntervention: products.filter(p => p.counts.price_too_high).map(p => {
      const prices = facts.filter(f => f.product_id === p.product_id && f.feedback_status === 'price_too_high' && f.target_price != null).map(f => Number(f.target_price));
      return { name: p.name, packaging: p.packaging, count: p.counts.price_too_high, share: p.share.price_too_high,
        avgTarget: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null };
    }).sort((a, b) => b.count - a.count),
    education: products.filter(p => p.counts.not_familiar).map(p => ({
      name: p.name, packaging: p.packaging, count: p.counts.not_familiar,
      opportunity: facts.filter(f => f.product_id === p.product_id && f.feedback_status === 'not_familiar' && f.education_opportunity).length,
    })).sort((a, b) => b.count - a.count),
    followupsOpen: facts.filter(f => f.followup_required).length,
  };
  return { overall, products, salespeople, insights };
}

// Customer-intelligence table filter. Empty filter value = no constraint.
export function filterFacts(facts, { q = '', status = '', productId = '', repId = '', followupOnly = false } = {}) {
  const needle = q.trim().toLowerCase();
  return facts.filter(f =>
    (!status || f.feedback_status === status) &&
    (!productId || f.product_id === productId) &&
    (!repId || f.rep_id === repId) &&
    (!followupOnly || f.followup_required) &&
    (!needle || [f.customer_name, f.rep_name, f.product_name, f.customer_comment, f.competitor_brand].some(v => (v || '').toLowerCase().includes(needle))));
}

// Same normalisation as get_or_create_customer() in 0004_customers.sql.
export const customerKey = (name, area) => `${String(name || '').trim().toUpperCase()}|${String(area || '').trim().toUpperCase()}`;
