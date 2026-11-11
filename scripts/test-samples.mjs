// Run: node --test scripts/test-samples.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isOverdue, sortSamples, stepPatch, unlinkedNeedsSample, dueCount } from '../features/samples-logic.js';

const T = '2026-11-11';
test('addDays crosses month/year', () => { assert.equal(addDays(T, 3), '2026-11-14'); assert.equal(addDays('2026-12-30', 3), '2027-01-02'); });
test('overdue only for requested/sent with a past date', () => {
  assert.equal(isOverdue({ status: 'sent', followup_due: '2026-11-10' }, T), true);
  assert.equal(isOverdue({ status: 'sent', followup_due: T }, T), false);
  assert.equal(isOverdue({ status: 'done', followup_due: '2026-01-01' }, T), false);
});
test('sort: overdue, then soonest, then undated, closed last', () => {
  const l = [{ id: 'done', status: 'done', created_at: 'b' }, { id: 'later', status: 'sent', followup_due: '2026-11-20' },
    { id: 'late', status: 'requested', followup_due: '2026-11-01' }, { id: 'none', status: 'feedback' }, { id: 'soon', status: 'sent', followup_due: '2026-11-12' }];
  assert.deepEqual(sortSamples(l, T).map(s => s.id), ['late', 'soon', 'later', 'none', 'done']);
});
test('stepPatch follows the flow and rejects skips', () => {
  assert.deepEqual(stepPatch({ status: 'requested' }, 'sent', T, 'now'), { status: 'sent', sent_at: 'now', followup_due: '2026-11-14' });
  assert.equal(stepPatch({ status: 'requested' }, 'positive', T, 'now'), null);
  assert.equal(stepPatch({ status: 'sent' }, 'order_placed', T, 'now').feedback_result, 'order_placed');
  assert.equal(stepPatch({ status: 'done' }, 'cancelled', T, 'now'), null);
});
test('unlinkedNeedsSample skips already-added items and other answers', () => {
  const facts = [{ item_id: 'a', feedback_status: 'needs_sample' }, { item_id: 'b', feedback_status: 'needs_sample' }, { item_id: 'c', feedback_status: 'interested' }];
  assert.deepEqual(unlinkedNeedsSample(facts, [{ source_item_id: 'a' }]).map(f => f.item_id), ['b']);
});
test('dueCount counts only my overdue/due-today', () => {
  const l = [{ rep_id: 1, status: 'sent', followup_due: T }, { rep_id: 1, status: 'sent', followup_due: '2026-11-30' }, { rep_id: 2, status: 'sent', followup_due: T }];
  assert.equal(dueCount(l, 1, T), 1);
});
