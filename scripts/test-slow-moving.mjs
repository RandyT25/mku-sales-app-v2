// Run: node --test scripts/test-slow-moving.mjs   (stdlib only, no install)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDBACK_OPTIONS, FIELD_DEFS, optionOf, progress, canComplete, patchForStatus, normalizeValue, summarize } from '../features/slow-moving-logic.js';

const items = (...s) => s.map(feedback_status => ({ feedback_status }));

test('exactly the 8 required answer options, matching the DB check constraint', () => {
  assert.deepEqual(FEEDBACK_OPTIONS.map(o => o.value).sort(), [
    'interested', 'needs_sample', 'not_applicable', 'not_familiar', 'not_interested',
    'packaging_issue', 'price_too_high', 'uses_competitor']);
});

test('every conditional field an option names is defined', () => {
  for (const o of FEEDBACK_OPTIONS) for (const f of o.fields) assert.ok(FIELD_DEFS[f], `${o.value}.${f}`);
});

test('progress counts answered items; not_applicable counts as answered', () => {
  assert.deepEqual(progress(items(null, 'interested', 'not_applicable')), { done: 2, total: 3 });
});

test('canComplete needs every item answered and at least one item', () => {
  assert.equal(canComplete([]), false);
  assert.equal(canComplete(items('interested', null)), false);
  assert.equal(canComplete(items('interested', 'not_applicable')), true);
});

test('patchForStatus clears fields that belong to other answers', () => {
  const p = patchForStatus('interested');
  assert.equal(p.feedback_status, 'interested');
  assert.equal('estimated_monthly_volume' in p, false); // kept by this status, not reset
  assert.equal(p.target_price, null);
  assert.equal(p.competitor_brand, null);
  assert.equal(p.followup_required, false);
  assert.equal('customer_comment' in p, false);          // comment survives status changes
});

test('normalizeValue: empty → null, numbers validated, bool coerced', () => {
  assert.equal(normalizeValue('text', '  '), null);
  assert.equal(normalizeValue('text', ' hi '), 'hi');
  assert.equal(normalizeValue('number', '12,5'), 12.5);
  assert.equal(normalizeValue('number', '-3'), null);
  assert.equal(normalizeValue('number', 'abc'), null);
  assert.equal(normalizeValue('bool', 1), true);
});

test('optionOf and summarize', () => {
  assert.equal(optionOf('nope'), null);
  const s = summarize(items('interested', 'interested', 'not_applicable', null));
  assert.equal(s.interested, 2); assert.equal(s.not_applicable, 1); assert.equal(s.not_interested, 0);
});

// ── dashboard metrics ──
import { computeMetrics, filterFacts, customerKey, pct } from '../features/slow-moving-metrics.js';

const F = (o) => ({ product_id: 'p1', product_name: 'Komi Shoyu', packaging: '5L', display_order: 1, rep_id: 'r1', rep_name: 'Rep A',
  customer_id: 'c1', followup_required: false, ...o });
const sess = (o) => ({ rep_id: 'r1', customer_id: 'c1', assessment_status: 'completed', reps: { name: 'Rep A' }, ...o });

test('Not applicable is excluded from every percentage denominator', () => {
  const facts = [F({ feedback_status: 'interested' }), F({ feedback_status: 'not_interested' }),
    F({ feedback_status: 'not_applicable' }), F({ feedback_status: 'not_applicable' })];
  const m = computeMetrics(facts, [sess({})]);
  const p = m.products[0];
  assert.equal(p.responses, 4);
  assert.equal(p.assessed, 2);                 // 4 responses − 2 N/A
  assert.equal(p.share.interested, 50);        // 1 / 2, NOT 1 / 4
  assert.equal(p.naShare, 50);                 // N/A shown as share of all responses
  assert.equal(m.overall.assessedItems, 2);
});

test('completion rate = completed ÷ all started sessions; customers distinct', () => {
  const s = [sess({ customer_id: 'c1' }), sess({ customer_id: 'c1' }), sess({ customer_id: 'c2' }),
    sess({ customer_id: 'c3', assessment_status: 'draft' })];
  const m = computeMetrics([], s);
  assert.equal(m.overall.completedSessions, 3);
  assert.equal(m.overall.customersAssessed, 2);
  assert.equal(m.overall.completionRate, 75);
});

test('no data → no division by zero, empty insights', () => {
  const m = computeMetrics([], []);
  assert.equal(m.overall.completionRate, null);
  assert.deepEqual(m.products, []);
  assert.deepEqual(m.insights.packaging, []);
  assert.equal(pct(1, 0), null);
});

test('salesperson quality counts detail, not just positives', () => {
  const facts = [
    F({ feedback_status: 'interested', estimated_monthly_volume: 20 }),
    F({ feedback_status: 'price_too_high' }),                   // actionable, no detail
    F({ feedback_status: 'not_applicable' }),                   // not actionable → ignored
  ];
  const [r] = computeMetrics(facts, [sess({})]).salespeople;
  assert.equal(r.detailRate, 50);
  assert.equal(r.interested, 1);
  assert.equal(r.completionRate, 100);
});

test('insights: packaging/competitor grouping is case-insensitive; pricing avg target', () => {
  const facts = [
    F({ feedback_status: 'packaging_issue', requested_packaging: '1L' }),
    F({ feedback_status: 'packaging_issue', requested_packaging: '1l' }),
    F({ feedback_status: 'uses_competitor', competitor_brand: 'Kikkoman' }),
    F({ feedback_status: 'price_too_high', target_price: 40000 }),
    F({ feedback_status: 'price_too_high', target_price: 50000 }),
  ];
  const { insights } = computeMetrics(facts, [sess({})]);
  assert.deepEqual(insights.packaging, [{ label: '1L', count: 2 }]);
  assert.equal(insights.competitors[0].label, 'Kikkoman');
  assert.equal(insights.pricingIntervention[0].avgTarget, 45000);
  assert.equal(insights.objections[0].status, 'price_too_high');
});

test('high/low interest lists never overlap', () => {
  const facts = [];
  for (let k = 0; k < 8; k++) facts.push(F({ product_id: 'p' + k, product_name: 'P' + k, display_order: k,
    feedback_status: k < 4 ? 'interested' : 'not_interested' }));
  const { insights } = computeMetrics(facts, [sess({})]);
  const hi = new Set(insights.highInterest.map(p => p.product_id));
  assert.equal(insights.highInterest.length, 3);
  assert.ok(insights.lowDemand.every(p => !hi.has(p.product_id)));
});

test('filterFacts combines filters; customerKey matches get_or_create_customer()', () => {
  const facts = [F({ feedback_status: 'interested', customer_name: 'Bali Hotel' }),
    F({ feedback_status: 'price_too_high', customer_name: 'Warung', followup_required: true, rep_id: 'r2' })];
  assert.equal(filterFacts(facts, { status: 'price_too_high' }).length, 1);
  assert.equal(filterFacts(facts, { q: 'bali' }).length, 1);
  assert.equal(filterFacts(facts, { repId: 'r2', followupOnly: true }).length, 1);
  assert.equal(filterFacts(facts, {}).length, 2);
  assert.equal(customerKey(' Bali Hotel ', 'ubud '), 'BALI HOTEL|UBUD');
  assert.equal(customerKey('X', null), 'X|');
});
