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
