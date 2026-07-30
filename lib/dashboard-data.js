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
export function runInlineScript(code) {
  const s = document.createElement('script');
  s.textContent = code;
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

window.DashboardData = { hasSession, runInlineScript, loadSales, loadCustomers, loadFJExcel };
