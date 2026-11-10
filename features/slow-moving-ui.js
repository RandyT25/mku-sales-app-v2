// Intel → Slow-Moving Products: salesperson assessment screen.
// Renders into #intel-list (called from renderIntelList in lib/app-core.js).
// Uses app-core globals at call time (escHtml, showToast, waitForGlobal,
// getRepCustomerList, groupIcon) — they all exist long before a rep can tap here.
import './slow-moving.js';
import {
  FEEDBACK_OPTIONS, FIELD_DEFS, optionOf, progress, canComplete,
  patchForStatus, normalizeValue, summarize,
} from './slow-moving-logic.js';

const S = {
  view: 'picker',      // 'picker' | 'assess' | 'summary'
  q: '', drafts: null, loadError: null,
  sessionId: null, customer: null, items: [], open: null,
  dirty: {},           // itemId -> accumulated patch not yet saved
  timers: {}, saveState: 'saved', busy: false,
};
const $ = id => document.getElementById(id);
const el = () => $('intel-list');
const api = () => window.SlowMoving;

// ── picker ───────────────────────────────────────────────────────────────
async function loadDrafts() {
  try { S.drafts = await api().fetchMyDrafts(); S.loadError = null; }
  catch (e) { console.error('fetchMyDrafts', e); S.loadError = e.message || String(e); S.drafts = []; }
  if (S.view === 'picker') render();
}

function pickerHtml() {
  const q = S.q.trim().toLowerCase();
  const all = typeof getRepCustomerList === 'function' ? getRepCustomerList() : [];
  const matches = (q ? all.filter(c => (c.name || '').toLowerCase().includes(q)) : all)
    .slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).slice(0, 40);
  const drafts = (S.drafts || []).map(d => {
    const n = d.product_assessment_items.filter(i => i.feedback_status).length;
    return `<button class="sm-row" onclick="SM.resume('${d.id}')">
      <span class="sm-row-main"><b>${escHtml(d.customers?.name || 'Customer')}</b><small>${escHtml(d.customers?.area || '')}</small></span>
      <span class="sm-chip sm-tone-warn">Resume ${n}/${d.product_assessment_items.length}</span></button>`;
  }).join('');
  return `
    <div class="sm-wrap">
      <div class="sm-title">Slow-Moving Products Assessment</div>
      <div class="sm-sub">Evaluate customer interest and identify commercial opportunities across our selected slow-moving products.</div>
      ${S.loadError ? `<div class="intel-form-error">Couldn't load your drafts: ${escHtml(S.loadError)}</div>` : ''}
      ${drafts ? `<div class="sm-sec">In progress</div><div class="sm-list">${drafts}</div>` : ''}
      <div class="sm-sec">Start an assessment</div>
      <input class="pl-search sm-search" id="sm-q" type="search" placeholder="Search customer…" value="${escHtml(S.q)}" oninput="SM.onSearch(this.value)" autocomplete="off">
      <div class="sm-list" id="sm-customers">${customersHtml(matches, q)}</div>
    </div>`;
}

function customersHtml(matches, q) {
  if (!matches.length) return `<div class="cust-empty">${q ? 'No matching customers' : 'No customers loaded'}</div>`;
  return matches.map(c => `<button class="sm-row" onclick="SM.start('${escHtml(c.code)}','${escHtml(c.sales || '')}')">
      <span class="sm-row-main"><b>${escHtml(c.name)}</b><small>${escHtml(c.area || '')}${c.group ? ' · ' + escHtml(c.group) : ''}</small></span>
      <span class="sm-go">›</span></button>`).join('');
}

// ── assessment ───────────────────────────────────────────────────────────
function fieldHtml(it, name) {
  const def = FIELD_DEFS[name], id = `sm-${it.id}-${name}`, v = it[name];
  if (def.type === 'bool') {
    return `<label class="sm-check"><input type="checkbox" ${v ? 'checked' : ''} onchange="SM.onField('${it.id}','${name}',this.checked,'bool')"> ${escHtml(def.label)}</label>`;
  }
  const t = def.type === 'number' ? 'number" inputmode="decimal" min="0" step="any' : def.type === 'date' ? 'date' : 'text';
  return `<label class="sm-field" for="${id}"><span>${escHtml(def.label)}</span>
    <input id="${id}" class="sm-input" type="${t}" value="${escHtml(v ?? '')}" oninput="SM.onField('${it.id}','${name}',this.value,'${def.type}')"></label>`;
}

function cardHtml(it) {
  const p = it.slow_moving_products, opt = optionOf(it.feedback_status), open = S.open === it.id;
  const chip = opt ? `<span class="sm-chip sm-tone-${opt.tone}">${escHtml(opt.label)}</span>` : `<span class="sm-chip sm-chip-none">Not assessed</span>`;
  const body = !open ? '' : `
    <div class="sm-card-body">
      <div class="sm-opts">${FEEDBACK_OPTIONS.map(o =>
        `<button class="sm-opt sm-tone-${o.tone}${o.value === it.feedback_status ? ' on' : ''}" onclick="SM.setStatus('${it.id}','${o.value}')">${escHtml(o.label)}</button>`).join('')}</div>
      ${opt ? opt.fields.map(f => fieldHtml(it, f)).join('') : ''}
      <label class="sm-field"><span>Customer comment (optional)</span>
        <textarea class="sm-input" rows="2" oninput="SM.onField('${it.id}','customer_comment',this.value,'text')">${escHtml(it.customer_comment || '')}</textarea></label>
      <button class="sm-next" onclick="SM.next('${it.id}')">Next product ›</button>
    </div>`;
  return `<div class="sm-card${open ? ' open' : ''}" id="sm-card-${it.id}">
    <button class="sm-card-head" onclick="SM.toggle('${it.id}')">
      <span class="sm-row-main"><b>${escHtml(p.product_name)}</b><small>${escHtml(p.packaging)}</small></span>${chip}</button>${body}</div>`;
}

function headerHtml() {
  const { done, total } = progress(S.items);
  const label = { saved: 'Saved', saving: 'Saving…', error: 'Not saved — will retry' }[S.saveState];
  return `<div class="sm-bar-top">
      <button class="sm-back" onclick="SM.back()">‹ Back</button>
      <span class="sm-save sm-save-${S.saveState}" id="sm-save">${label}</span></div>
    <div class="sm-cust">${escHtml(S.customer?.name || '')}</div>
    <div class="sm-prog"><div class="sm-prog-bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div><span>${done}/${total}</span></div>`;
}

function assessHtml() {
  return `<div class="sm-wrap">
    <div class="sm-head" id="sm-head">${headerHtml()}</div>
    <div id="sm-cards">${S.items.map(cardHtml).join('')}</div>
    <button class="sm-primary" onclick="SM.review()">Review &amp; complete</button></div>`;
}

function summaryHtml() {
  const counts = summarize(S.items);
  return `<div class="sm-wrap">
    <div class="sm-title">Review assessment</div>
    <div class="sm-sub">${escHtml(S.customer?.name || '')} — all ${S.items.length} products assessed.</div>
    <div class="sm-list">${S.items.map(i => {
      const o = optionOf(i.feedback_status);
      return `<div class="sm-row sm-row-static"><span class="sm-row-main"><b>${escHtml(i.slow_moving_products.product_name)}</b><small>${escHtml(i.slow_moving_products.packaging)}</small></span><span class="sm-chip sm-tone-${o.tone}">${escHtml(o.label)}</span></div>`;
    }).join('')}</div>
    <div class="sm-sub" style="margin-top:10px">${FEEDBACK_OPTIONS.filter(o => counts[o.value]).map(o => `${counts[o.value]} ${escHtml(o.label.toLowerCase())}`).join(' · ')}</div>
    <button class="sm-primary" ${S.busy ? 'disabled' : ''} onclick="SM.submit()">${S.busy ? 'Submitting…' : 'Submit assessment'}</button>
    <button class="sm-secondary" onclick="SM.edit()">Back to edit</button></div>`;
}

function render() {
  const host = el(); if (!host) return;
  host.innerHTML = S.view === 'assess' ? assessHtml() : S.view === 'summary' ? summaryHtml() : pickerHtml();
  if (S.view === 'picker' && S.drafts === null) loadDrafts();
}

// ── autosave: per-item debounce, retry on failure, flushed before completion ──
function queue(id, patch, delay = 700) {
  S.dirty[id] = { ...(S.dirty[id] || {}), ...patch };
  setSave('saving');
  clearTimeout(S.timers[id]);
  S.timers[id] = setTimeout(() => saveOne(id), delay);
}
function setSave(state) {
  S.saveState = state;
  const n = $('sm-save');
  if (n) { n.className = 'sm-save sm-save-' + state; n.textContent = { saved: 'Saved', saving: 'Saving…', error: 'Not saved — will retry' }[state]; }
}
async function saveOne(id) {
  const patch = S.dirty[id]; if (!patch) return;
  delete S.dirty[id];
  try { await api().saveItem(id, patch); }
  catch (e) {
    console.error('saveItem', e);
    S.dirty[id] = { ...patch, ...(S.dirty[id] || {}) }; // keep unsaved edits
    setSave('error'); clearTimeout(S.timers[id]); S.timers[id] = setTimeout(() => saveOne(id), 5000);
    return;
  }
  if (!Object.keys(S.dirty).length) setSave('saved');
}
async function flush() {
  Object.values(S.timers).forEach(clearTimeout);
  await Promise.all(Object.keys(S.dirty).map(saveOne));
  return !Object.keys(S.dirty).length;
}
function refreshHead() { const h = $('sm-head'); if (h) h.innerHTML = headerHtml(); }
function repaintCard(id) {
  const it = S.items.find(i => i.id === id), node = $('sm-card-' + id);
  if (it && node) node.outerHTML = cardHtml(it);
}

// ── actions (window.SM, called from inline handlers) ─────────────────────
const SM = window.SM = {
  render,
  onSearch(v) {
    S.q = v;
    // Only the list is re-rendered so the search box keeps focus.
    const q = v.trim().toLowerCase();
    const all = typeof getRepCustomerList === 'function' ? getRepCustomerList() : [];
    const m = (q ? all.filter(c => (c.name || '').toLowerCase().includes(q)) : all)
      .slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).slice(0, 40);
    const box = $('sm-customers'); if (box) box.innerHTML = customersHtml(m, q);
  },

  async start(code, rep) {
    const all = getRepCustomerList();
    const c = all.find(x => String(x.code) === String(code) && (x.sales || '') === rep) || all.find(x => String(x.code) === String(code));
    if (!c) { showToast('Customer not found'); return; }
    try {
      showToast('Opening assessment…', 1500);
      await waitForGlobal('CustomerIdentity');
      const customerId = await window.CustomerIdentity.getOrCreateCustomerId(c.name, c.area);
      const sessionId = await api().startAssessment(customerId);
      await enter(sessionId, { name: c.name, area: c.area });
    } catch (e) { console.error('start assessment', e); showToast("Couldn't start — " + (e.message || e), 4000); }
  },

  async resume(sessionId) {
    const d = (S.drafts || []).find(x => x.id === sessionId);
    try { await enter(sessionId, { name: d?.customers?.name, area: d?.customers?.area }); }
    catch (e) { console.error('resume assessment', e); showToast("Couldn't open — " + (e.message || e), 4000); }
  },

  toggle(id) { S.open = S.open === id ? null : id; $('sm-cards').innerHTML = S.items.map(cardHtml).join(''); },

  setStatus(id, status) {
    const it = S.items.find(i => i.id === id); if (!it) return;
    const patch = patchForStatus(status);
    Object.assign(it, patch);
    queue(id, patch, 250);
    repaintCard(id); refreshHead();
  },

  onField(id, name, raw, type) {
    const it = S.items.find(i => i.id === id); if (!it) return;
    const v = normalizeValue(type, raw);
    it[name] = v;
    queue(id, { [name]: v });
  },

  next(id) {
    const i = S.items.findIndex(x => x.id === id);
    const order = [...S.items.slice(i + 1), ...S.items.slice(0, i)];
    const target = order.find(x => !x.feedback_status) || order[0];
    S.open = target ? target.id : null;
    $('sm-cards').innerHTML = S.items.map(cardHtml).join('');
    $('sm-card-' + S.open)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async review() {
    if (!canComplete(S.items)) {
      const first = S.items.find(i => !i.feedback_status);
      const { done, total } = progress(S.items);
      showToast(`${total - done} product${total - done === 1 ? '' : 's'} still need an answer`, 3000);
      if (first) { S.open = first.id; $('sm-cards').innerHTML = S.items.map(cardHtml).join(''); $('sm-card-' + first.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      return;
    }
    if (!(await flush())) { showToast("Still saving — check your connection and try again", 3500); return; }
    S.view = 'summary'; render(); window.scrollTo(0, 0);
  },

  edit() { S.view = 'assess'; render(); },

  async submit() {
    if (S.busy) return;
    S.busy = true; render();
    try {
      await api().completeAssessment(S.sessionId);
      showToast('Assessment completed ✓', 3000);
      S.view = 'picker'; S.drafts = null; S.sessionId = null; S.items = []; S.q = '';
    } catch (e) {
      console.error('complete assessment', e);
      showToast(String(e.message || e).includes('incomplete') ? 'Some products still have no answer' : "Couldn't submit — " + (e.message || e), 4000);
    } finally { S.busy = false; render(); }
  },

  async back() {
    await flush();
    S.view = 'picker'; S.drafts = null; S.sessionId = null; S.items = []; render();
  },
};

async function enter(sessionId, customer) {
  S.items = await api().fetchItems(sessionId);
  S.sessionId = sessionId; S.customer = customer; S.dirty = {}; S.saveState = 'saved';
  S.open = (S.items.find(i => !i.feedback_status) || S.items[0])?.id || null;
  S.view = 'assess'; render(); window.scrollTo(0, 0);
}
