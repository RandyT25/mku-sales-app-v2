// Run: node --test scripts/test-i18n.mjs  — runs lib/i18n.js against a tiny DOM stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(lang) {
  const store = { 'mku-lang': lang };
  const ctx = { navigator: { language: 'en' }, localStorage: { getItem: k => store[k], setItem: (k, v) => { store[k] = v; } },
    MutationObserver: class { observe() {} disconnect() {} }, document: { readyState: 'complete', body: null, documentElement: {}, getElementById: () => null, addEventListener() {} } };
  const mk = (type, props) => ({ nodeType: type, childNodes: [], ...props });
  const text = v => mk(3, { nodeValue: v, parentNode: { nodeName: 'DIV' } });
  const el = (kids, attrs = {}) => mk(1, { nodeName: 'DIV', childNodes: kids, hasAttribute: a => a in attrs, getAttribute: a => attrs[a], setAttribute: (a, v) => { attrs[a] = v; }, attrs });
  const t1 = text('Customers'), t2 = text('  Mark sent '), t3 = text('Overdue · 12 Nov'), t4 = text('Rep name'), t5 = text('12 customers');
  const body = el([t1, t2, t3, t4, t5], { placeholder: 'Search customer…' });
  ctx.document.body = body; ctx.window = ctx;
  vm.runInNewContext(readFileSync(new URL('../lib/i18n.js', import.meta.url), 'utf8'), ctx);
  return { ctx, body, t: [t1, t2, t3, t4, t5] };
}

test('id: translates exact, trimmed, pattern, attribute; leaves unknown text', () => {
  const { body, t } = load('id');
  assert.deepEqual(t.map(n => n.nodeValue), ['Pelanggan', '  Tandai terkirim ', 'Terlambat · 12 Nov', 'Rep name', '12 pelanggan']);
  assert.equal(body.attrs.placeholder, 'Cari pelanggan…');
});
test('toggle back restores English', () => {
  const { ctx, body, t } = load('id');
  ctx.I18n.toggle();
  assert.deepEqual(t.map(n => n.nodeValue), ['Customers', '  Mark sent ', 'Overdue · 12 Nov', 'Rep name', '12 customers']);
  assert.equal(body.attrs.placeholder, 'Search customer…');
});
