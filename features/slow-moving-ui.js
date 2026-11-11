// Intel → Slow-Moving Products: salesperson assessment screen.
// Renders into #intel-list (called from renderIntelList in lib/app-core.js).
// Uses app-core globals at call time (escHtml, showToast, waitForGlobal,
// getRepCustomerList, groupIcon) — they all exist long before a rep can tap here.
import './slow-moving.js';
import './slow-moving-dash.js';
import {
  FEEDBACK_OPTIONS, FIELD_DEFS, optionOf, progress, canComplete,
  patchForStatus, normalizeValue, summarize,
} from './slow-moving-logic.js';

const S = {
  mode: null,          // 'assess' | 'dash'; null = pick a default on first render (managers → dash)
  view: 'picker',      // 'picker' | 'assess' | 'summary'
  q: '', drafts: null, loadError: null,
  sessionId: null, customer: null, items: [], open: null,
  dirty: {},           // product key -> accumulated patch not yet saved
  timers: {}, saveState: 'saved', busy: false, materializing: null,
};
const $ = id => document.getElementById(id);
const el = () => $('intel-list');
const api = () => window.SlowMoving;
const NOT_SET_UP = "Slow-Moving Products isn't set up on the server yet (database migration 0017 is not applied).";
const errText = e => (api().isNotSetUp(e) ? NOT_SET_UP : (e.message || String(e)));
// Managers and Super Admin get the dashboard alongside the assessment form.
const canDash = () => !!(typeof currentRep !== 'undefined' && (currentRep?.isManager || currentRep?.isSuperAdmin));
function modeToggleHtml() {
  if (!canDash()) return '';
  if (!S.mode) S.mode = 'dash';
  const b = (m, t) => `<button class="intel-view-tab${S.mode === m ? ' active' : ''}" onclick="SM.setMode('${m}')">${t}</button>`;
  return `<div class="intel-view-tabs sm-mode">${b('assess', 'Assess')}${b('dash', 'Dashboard')}</div>`;
}

// ── picker ───────────────────────────────────────────────────────────────
async function loadDrafts() {
  try { S.drafts = await api().fetchMyDrafts(); S.loadError = null; }
  catch (e) { console.error('fetchMyDrafts', e); S.loadError = errText(e); S.drafts = []; }
  if (S.view === 'picker') render();
}

// Full list, no cap — reps must see every customer they own.
const pickerMatches = q => {
  const all = typeof getRepCustomerList === 'function' ? getRepCustomerList() : [];
  return (q ? all.filter(c => (c.name || '').toLowerCase().includes(q)) : all)
    .slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

function pickerHtml() {
  const q = S.q.trim().toLowerCase();
  const matches = pickerMatches(q);
  const drafts = (S.drafts || []).filter(d => d.product_assessment_items.some(i => i.feedback_status)).map(d => {
    const n = d.product_assessment_items.filter(i => i.feedback_status).length;
    return `<button class="sm-row" onclick="SM.resume('${d.id}')">
      <span class="sm-row-main"><b>${escHtml(d.customers?.name || 'Customer')}</b><small>${escHtml(d.customers?.area || '')}</small></span>
      <span class="sm-chip sm-tone-warn">Resume ${n}/${d.product_assessment_items.length}</span></button>`;
  }).join('');
  return `
    <div class="sm-wrap">
      ${modeToggleHtml()}
      <div class="sm-title">Slow-Moving Products Assessment</div>
      <div class="sm-sub">Evaluate customer interest and identify commercial opportunities across our selected slow-moving products.</div>
      ${S.loadError ? `<div class="intel-form-error">Couldn't load your drafts: ${escHtml(S.loadError)}</div>` : ''}
      ${drafts ? `<div class="sm-sec">In progress</div><div class="sm-list">${drafts}</div>` : ''}
      <div class="sm-sec">Start an assessment</div>
      <input class="pl-search sm-search" id="sm-q" type="search" placeholder="Search customer…" value="${escHtml(S.q)}" oninput="SM.onSearch(this.value)" autocomplete="off">
      <div class="sm-sub" id="sm-count">${matches.length} customers</div>
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
  const def = FIELD_DEFS[name], id = `sm-${it.key}-${name}`, v = it[name];
  if (def.type === 'bool') {
    return `<label class="sm-check"><input type="checkbox" ${v ? 'checked' : ''} onchange="SM.onField('${it.key}','${name}',this.checked,'bool')"> ${escHtml(def.label)}</label>`;
  }
  const t = def.type === 'number' ? 'number" inputmode="decimal" min="0" step="any' : def.type === 'date' ? 'date' : 'text';
  return `<label class="sm-field" for="${id}"><span>${escHtml(def.label)}</span>
    <input id="${id}" class="sm-input" type="${t}" value="${escHtml(v ?? '')}" oninput="SM.onField('${it.key}','${name}',this.value,'${def.type}')"></label>`;
}

function cardHtml(it) {
  const p = it.slow_moving_products, opt = optionOf(it.feedback_status), open = S.open === it.key;
  const chip = opt ? `<span class="sm-chip sm-tone-${opt.tone}">${escHtml(opt.label)}</span>` : `<span class="sm-chip sm-chip-none">Not assessed</span>`;
  const body = !open ? '' : `
    <div class="sm-card-body">
      <div class="sm-opts">${FEEDBACK_OPTIONS.map(o =>
        `<button class="sm-opt sm-tone-${o.tone}${o.value === it.feedback_status ? ' on' : ''}" onclick="SM.setStatus('${it.key}','${o.value}')">${escHtml(o.label)}</button>`).join('')}</div>
      ${opt ? opt.fields.map(f => fieldHtml(it, f)).join('') : ''}
      <label class="sm-field"><span>Customer comment (optional)</span>
        <textarea class="sm-input" rows="2" oninput="SM.onField('${it.key}','customer_comment',this.value,'text')">${escHtml(it.customer_comment || '')}</textarea></label>
      <button class="sm-next" onclick="SM.next('${it.key}')">Next product ›</button>
    </div>`;
  return `<div class="sm-card${open ? ' open' : ''}" id="sm-card-${it.key}">
    <button class="sm-card-head" onclick="SM.toggle('${it.key}')">
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
  if (!S.mode) S.mode = canDash() ? 'dash' : 'assess';
  if (S.mode === 'dash' && canDash()) { window.SMDash.render(); return; }
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
// The server draft (visit note + session + items) is created lazily, on the
// first answer — merely opening a customer must never leave an "In progress" row.
async function materialize() {
  if (S.sessionId) return;
  if (!S.materializing) {
    S.materializing = (async () => {
      await waitForGlobal('CustomerIdentity');
      const customerId = await window.CustomerIdentity.getOrCreateCustomerId(S.customer.name, S.customer.area);
      const sid = await api().startAssessment(customerId); // returns the rep's existing draft if there is one
      for (const s of await api().fetchItems(sid)) {
        const it = S.items.find(i => i.key === s.product_id);
        if (!it) { S.items.push({ ...s, key: s.product_id }); continue; }
        // adopt answers already stored in a pre-existing draft, unless edited here
        if (!it.feedback_status && !S.dirty[it.key] && s.feedback_status) Object.assign(it, s, { key: it.key });
        it.id = s.id;
      }
      S.sessionId = sid;
    })().finally(() => { S.materializing = null; });
  }
  return S.materializing;
}
async function saveOne(key) {
  const patch = S.dirty[key]; if (!patch) return;
  delete S.dirty[key];
  try {
    await materialize();
    await api().saveItem(S.items.find(i => i.key === key).id, patch);
  } catch (e) {
    console.error('saveItem', e);
    S.dirty[key] = { ...patch, ...(S.dirty[key] || {}) }; // keep unsaved edits
    setSave('error'); clearTimeout(S.timers[key]); S.timers[key] = setTimeout(() => saveOne(key), 5000);
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
function repaintCard(key) {
  const it = S.items.find(i => i.key === key), node = $('sm-card-' + key);
  if (it && node) node.outerHTML = cardHtml(it);
}

// ── actions (window.SM, called from inline handlers) ─────────────────────
const SM = window.SM = {
  render, modeToggleHtml,
  setMode(m) { S.mode = m; if (m === 'assess') { S.view = 'picker'; S.drafts = null; } render(); },
  onSearch(v) {
    S.q = v;
    // Only the list is re-rendered so the search box keeps focus.
    const q = v.trim().toLowerCase();
    const m = pickerMatches(q);
    const box = $('sm-customers'); if (box) box.innerHTML = customersHtml(m, q);
    const n = $('sm-count'); if (n) n.textContent = m.length + ' customers';
  },

  async start(code, rep) {
    const all = getRepCustomerList();
    const c = all.find(x => String(x.code) === String(code) && (x.sales || '') === rep) || all.find(x => String(x.code) === String(code));
    if (!c) { showToast('Customer not found'); return; }
    try {
      // Already have a draft with answers for this customer? Resume it. Otherwise
      // open a blank form locally — nothing is created on the server until an answer is given.
      const existing = (S.drafts || []).find(d => d.customers?.name === c.name && (d.customers?.area || '') === (c.area || '')
        && d.product_assessment_items.some(i => i.feedback_status));
      if (existing) return await enter(existing.id, { name: c.name, area: c.area });
      await startFresh({ name: c.name, area: c.area });
    } catch (e) { console.error('start assessment', e); showToast("Couldn't start — " + errText(e), 5000); }
  },

  async resume(sessionId) {
    const d = (S.drafts || []).find(x => x.id === sessionId);
    try { await enter(sessionId, { name: d?.customers?.name, area: d?.customers?.area }); }
    catch (e) { console.error('resume assessment', e); showToast("Couldn't open — " + errText(e), 5000); }
  },

  toggle(key) { S.open = S.open === key ? null : key; $('sm-cards').innerHTML = S.items.map(cardHtml).join(''); },

  setStatus(key, status) {
    const it = S.items.find(i => i.key === key); if (!it) return;
    const patch = patchForStatus(status);
    Object.assign(it, patch);
    queue(key, patch, 250);
    repaintCard(key); refreshHead();
  },

  onField(key, name, raw, type) {
    const it = S.items.find(i => i.key === key); if (!it) return;
    const v = normalizeValue(type, raw);
    it[name] = v;
    queue(key, { [name]: v });
  },

  next(key) {
    const i = S.items.findIndex(x => x.key === key);
    const order = [...S.items.slice(i + 1), ...S.items.slice(0, i)];
    const target = order.find(x => !x.feedback_status) || order[0];
    S.open = target ? target.key : null;
    $('sm-cards').innerHTML = S.items.map(cardHtml).join('');
    $('sm-card-' + S.open)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async review() {
    if (!canComplete(S.items)) {
      const first = S.items.find(i => !i.feedback_status);
      const { done, total } = progress(S.items);
      showToast(`${total - done} product${total - done === 1 ? '' : 's'} still need an answer`, 3000);
      if (first) { S.open = first.key; $('sm-cards').innerHTML = S.items.map(cardHtml).join(''); $('sm-card-' + first.key)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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
      if (!S.sessionId) throw new Error('Nothing to submit yet');
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

// Items are addressed by `key` (the product id, stable before and after the
// server draft exists); `id` is the server row id, null until materialize().
function open_(items, sessionId, customer) {
  S.items = items; S.sessionId = sessionId; S.customer = customer; S.dirty = {}; S.timers = {}; S.saveState = 'saved';
  S.open = (S.items.find(i => !i.feedback_status) || S.items[0])?.key || null;
  S.view = 'assess'; render(); window.scrollTo(0, 0);
}
async function enter(sessionId, customer) {
  open_((await api().fetchItems(sessionId)).map(i => ({ ...i, key: i.product_id })), sessionId, customer);
}
async function startFresh(customer) {
  const prods = await api().fetchActiveProducts();
  if (!prods.length) throw new Error('No slow-moving products are configured');
  open_(prods.map(p => ({ id: null, key: p.id, product_id: p.id, feedback_status: null, customer_comment: null, followup_required: false,
    slow_moving_products: { product_name: p.product_name, packaging: p.packaging, display_order: p.display_order } })), null, customer);
}
