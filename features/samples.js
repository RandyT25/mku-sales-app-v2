// Intel → Samples: log a sample (customer asked / rep sampling) and follow it
// requested → sent → feedback → done. Renders into #intel-list; permissions are
// enforced by RLS (0018), the UI just hides buttons the user can't use.
import { supabase } from '../lib/supabase-client.js';
import { STATUS_LABEL, RESULT_LABEL, OPEN, isoDate, addDays, isOverdue, isDueToday, sortSamples, stepPatch, unlinkedNeedsSample, dueCount } from './samples-logic.js';

const COLS = 'id, rep_id, customer_name, customer_area, product_name, qty, source, source_item_id, status, followup_due, sent_at, feedback_result, notes, created_at, reps(name)';
const S = { rows: [], facts: [], loaded: false, error: null, scope: null, status: 'open' };
const $ = id => document.getElementById(id);
const today = () => isoDate(new Date());
const isAdmin = () => !!(currentRep?.isManager || currentRep?.isSuperAdmin);
const canEdit = r => isAdmin() || r.rep_id === currentRep?.repId;
const SRC = { customer_request: 'Customer asked', rep_initiated: 'Rep sampling', slow_moving: 'Slow-Moving' };

async function load() {
  S.error = null;
  const [a, b] = await Promise.all([
    supabase.from('sample_requests').select(COLS).order('created_at', { ascending: false }),
    // suggestions only; a failure here (view missing) must not break the tab
    supabase.from('slow_moving_item_facts').select('item_id, product_name, packaging, customer_name, customer_area, rep_id, rep_name, sample_requirements').eq('feedback_status', 'needs_sample'),
  ]);
  if (a.error) { S.error = a.error.code === '42P01' || /sample_requests/.test(a.error.message) ? "Samples isn't set up on the server yet (migration 0018 is not applied)." : a.error.message; S.rows = []; }
  else S.rows = a.data;
  S.facts = b.error ? [] : b.data;
  S.loaded = true;
  badge();
}
function badge() {
  const n = dueCount(S.rows, currentRep?.repId, today()), b = $('samples-badge');
  if (b) { b.textContent = n || ''; b.style.display = n ? 'inline-flex' : 'none'; }
}

function cardHtml(r) {
  const t = today(), od = isOverdue(r, t), edit = canEdit(r), id = r.id;
  const due = r.followup_due ? `<span class="smp-due${od ? ' od' : ''}">${od ? 'Overdue · ' : isDueToday(r, t) ? 'Due today · ' : 'Follow up '}${new Date(r.followup_due + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>` : '';
  const btn = (a, label, cls = '') => `<button class="smp-btn ${cls}" onclick="Samples.act('${id}','${a}')">${label}</button>`;
  const acts = !edit ? '' : r.status === 'requested' ? btn('sent', 'Mark sent', 'pri') + btn('cancelled', 'Cancel')
    : r.status === 'sent' ? ['positive', 'negative', 'order_placed'].map(k => btn(k, RESULT_LABEL[k])).join('') + btn('cancelled', 'Cancel')
    : r.status === 'feedback' ? btn('done', 'Mark done', 'pri') : '';
  const rep = r.reps?.name || 'Unknown';
  return `<div class="intel-card">
    <div class="intel-card-top"><div class="intel-card-info">
      <div class="intel-card-competitor">${escHtml(r.product_name)}${r.qty ? ' · ' + escHtml(r.qty) : ''}</div>
      <div class="intel-card-product">${escHtml(r.customer_name)}${r.customer_area ? ' · ' + escHtml(r.customer_area) : ''}</div></div>
      <div class="intel-card-price"><span class="deal-status-pill smp-${r.status}">${STATUS_LABEL[r.status]}${r.feedback_result ? ' · ' + RESULT_LABEL[r.feedback_result] : ''}</span>${due}</div></div>
    ${r.notes ? `<div class="intel-card-notes">${escHtml(r.notes)}</div>` : ''}
    <div class="intel-card-foot">${avatarHtml(rep, repColorByName(rep), 20)}<span class="intel-card-rep">${escHtml(rep)}</span>
      <span class="intel-card-date">${escHtml(SRC[r.source] || '')}</span></div>
    ${acts ? `<div class="smp-acts">${acts}</div>` : ''}</div>`;
}

function render() {
  const host = $('intel-list'); if (!host) return;
  if (!S.loaded) {
    host.innerHTML = '<div class="cust-loading"><div class="cust-loading-spinner"></div><div class="cust-loading-txt">Loading samples…</div></div>';
    load().then(render).catch(e => { S.error = e.message || String(e); S.loaded = true; render(); });
    return;
  }
  if (S.error) { host.innerHTML = `<div class="cust-empty">${escHtml(S.error)}</div>`; return; }
  if (!S.scope) S.scope = isAdmin() ? 'all' : 'mine';
  const t = today(), mine = r => r.rep_id === currentRep?.repId;
  const scoped = S.rows.filter(r => S.scope === 'all' || mine(r));
  const list = sortSamples(scoped.filter(r => S.status === 'open' ? OPEN.includes(r.status) : !OPEN.includes(r.status)), t);
  const sugg = unlinkedNeedsSample(S.facts, S.rows).filter(f => f.rep_id === currentRep?.repId); // RLS: a rep can only insert as themselves
  const chip = (k, v, label, cur) => `<button class="intel-view-tab${cur === v ? ' active' : ''}" onclick="Samples.set('${k}','${v}')">${label}</button>`;
  host.innerHTML = `<div class="sm-wrap">
    <div class="intel-view-tabs sm-mode">${chip('scope', 'mine', 'Mine', S.scope)}${chip('scope', 'all', 'All reps', S.scope)}</div>
    <div class="intel-view-tabs sm-mode">${chip('status', 'open', 'Open', S.status)}${chip('status', 'closed', 'Closed', S.status)}</div>
    ${sugg.length && S.status === 'open' ? `<div class="sm-sec">From Slow-Moving — customers who need a sample</div><div class="sm-list">${sugg.map(f =>
      `<div class="sm-row sm-row-static"><span class="sm-row-main"><b>${escHtml(f.product_name)}</b><small>${escHtml(f.customer_name)}${f.sample_requirements ? ' · ' + escHtml(f.sample_requirements) : ''}</small></span>
       <button class="smp-btn pri" onclick="Samples.adopt('${f.item_id}')">Add</button></div>`).join('')}</div>` : ''}
    <div class="sm-sec">${S.status === 'open' ? 'Follow-ups' : 'Closed'} (${list.length})</div>
    ${list.length ? list.map(cardHtml).join('') : `<div class="cust-empty">${S.status === 'open' ? 'No open samples. Tap “+ Sample” to log one.' : 'Nothing closed yet.'}</div>`}</div>`;
}

async function insert(row) {
  const { error } = await supabase.from('sample_requests').insert({ rep_id: currentRep.repId, followup_due: addDays(today(), 2), ...row });
  if (error) throw error;
  await load(); render();
}

function openForm() {
  closeForm();
  const custs = (typeof getRepCustomerList === 'function' ? getRepCustomerList() : []).map(c => `<option value="${escHtml(c.name)}">${escHtml(c.area || '')}</option>`).join('');
  const prods = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).map(p => `<option value="${escHtml(p.name)}">`).join('');
  const f = (id, label, extra) => `<div class="pm-det full"><div class="pm-det-label">${label}</div><input class="order-cust-inp" id="smp-${id}" autocomplete="off" ${extra || ''}></div>`;
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'smp-overlay'; o.style.zIndex = 210;
  o.onclick = e => { if (e.target === o) closeForm(); };
  o.innerHTML = `<div class="prod-modal"><div class="pm-handle"></div><div class="pm-name">Log Sample</div>
    <div class="pm-details" style="grid-template-columns:1fr">
      ${f('cust', 'Customer *', 'list="smp-custs" placeholder="Search or type a name"')}<datalist id="smp-custs">${custs}</datalist>
      ${f('prod', 'Product *', 'list="smp-prods" placeholder="Search product"')}<datalist id="smp-prods">${prods}</datalist>
      ${f('qty', 'Quantity / size', 'placeholder="e.g. 2 x 500g"')}
      <div class="pm-det full"><div class="pm-det-label">Why</div><select class="order-cust-inp" id="smp-src"><option value="customer_request">Customer asked</option><option value="rep_initiated">I want to sample</option></select></div>
      ${f('notes', 'Notes', 'placeholder="Optional"')}
    </div><div class="intel-form-error" id="smp-err">&nbsp;</div>
    <div class="pm-actions"><button class="pm-btn-close" onclick="Samples.closeForm()">✕</button>
      <button class="pm-btn-add" style="flex:1" id="smp-save" onclick="Samples.submit()">Save</button></div></div>`;
  document.body.appendChild(o); document.body.style.overflow = 'hidden';
}
function closeForm() { $('smp-overlay')?.remove(); document.body.style.overflow = ''; }

window.Samples = {
  render, openForm, closeForm, init: () => load().then(() => { if (typeof _intelView !== 'undefined' && _intelView === 'samples') render(); }).catch(e => console.error('samples', e)),
  set(k, v) { S[k] = v; render(); },
  async submit() {
    const v = id => $('smp-' + id).value.trim(), err = $('smp-err');
    const area = (typeof getRepCustomerList === 'function' ? getRepCustomerList() : []).find(c => c.name === v('cust'))?.area || null;
    if (!v('cust') || !v('prod')) { err.textContent = 'Customer and product are required.'; return; }
    $('smp-save').disabled = true;
    try { await insert({ customer_name: v('cust'), customer_area: area, product_name: v('prod'), qty: v('qty') || null, source: v('src'), notes: v('notes') || null }); closeForm(); showToast('Sample logged'); }
    catch (e) { err.textContent = e.message || String(e); $('smp-save').disabled = false; }
  },
  async adopt(itemId) {
    const f = S.facts.find(x => x.item_id === itemId); if (!f) return;
    try { await insert({ customer_name: f.customer_name, customer_area: f.customer_area, product_name: f.product_name + (f.packaging ? ' ' + f.packaging : ''), source: 'slow_moving', source_item_id: itemId, notes: f.sample_requirements || null }); showToast('Added to follow-up'); }
    catch (e) { showToast("Couldn't add — " + (e.message || e), 5000); }
  },
  async act(id, action) {
    const r = S.rows.find(x => x.id === id); if (!r) return;
    const patch = stepPatch(r, action, today(), new Date().toISOString()); if (!patch) return;
    const { error, count } = await supabase.from('sample_requests').update({ ...patch, updated_at: new Date().toISOString() }, { count: 'exact' }).eq('id', id);
    if (error || !count) { showToast("Couldn't update — " + (error?.message || 'no permission'), 5000); return; }
    Object.assign(r, patch); badge(); render();
  },
};
