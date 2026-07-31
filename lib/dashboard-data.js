// Loads sales/customer/delivery data through the auth-gated dashboard-proxy
// Edge Function instead of fetching the (now-private) MKU-MKS-Area-Dashboard
// repo directly from the browser. See supabase/functions/dashboard-proxy.
import { supabase } from './supabase-client.js';

const PROXY_URL = 'https://hwgrswtahduyqxfokbwj.supabase.co/functions/v1/dashboard-proxy';

async function _authedFetch(qs, { binary = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw { code: 'no_session' };
  const resp = await fetch(`${PROXY_URL}?${qs}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  if (!resp.ok) throw { code: 'proxy_error', status: resp.status };
  return binary ? resp.arrayBuffer() : resp.text();
}

export async function hasSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

// Executes fetched JS text in true global scope — same effect as the old
// <script src="...github.io/.../data_sales.js"> loading (const RAW=…,
// var CUSTOMERS=… land as bare-identifier globals either way), just sourced
// from the proxy response body instead of a public URL, since a plain
// <script src> tag can't carry an Authorization header.
//
// data_sales.js declares its top-level variable with `const` — fine the
// first time, but re-injecting a second <script> tag with the same `const
// RAW = ...` throws "Identifier 'RAW' has already been declared" (top-level
// let/const in classic scripts share one lexical record across every
// <script> tag in the document, unlike var). Since a refresh needs to run
// this exact code more than once per page load (manual refresh button,
// reconnect, resume-from-background — see _refreshCurrentScreen in
// lib/app-core.js), rewrite the leading `const`/`let` declaration into a
// plain `window.X = ` assignment before executing — safe to repeat any
// number of times, and still lands as both a bare global identifier and a
// window property either way.
export function runInlineScript(code) {
  const rewritten = code.replace(/^(const|let|var)\s+(\w+)\s*=/, 'window.$2 =');
  const s = document.createElement('script');
  s.textContent = rewritten;
  document.head.appendChild(s);
  document.head.removeChild(s); // execution is synchronous for non-src scripts
}

export async function loadSales() {
  try {
    runInlineScript(await _authedFetch('type=jsfile&file=data_sales.js'));
  } catch (e) {
    console.warn('sales proxy fetch failed, trying fallback', e);
    runInlineScript(await _authedFetch('type=jsfile&file=data.js'));
  }
}

export async function loadCustomers() {
  runInlineScript(await _authedFetch('type=jsfile&file=customers.js'));
}

export async function loadFJExcel(filename) {
  return _authedFetch('type=fj&file=' + encodeURIComponent(filename), { binary: true });
}

// Lists uploads/ so the caller can check which delivery files actually exist
// before fetching, instead of guessing forward through several dates.
export async function listFJFiles() {
  return JSON.parse(await _authedFetch('type=list'));
}

window.DashboardData = { hasSession, runInlineScript, loadSales, loadCustomers, loadFJExcel, listFJFiles };
