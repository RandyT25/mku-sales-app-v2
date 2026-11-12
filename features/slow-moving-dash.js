// Intel → Slow-Moving Products: management dashboard (Manager / Super Admin).
// Renders into #intel-list via window.SMDash.render(), called from slow-moving-ui.js.
import './slow-moving.js';
import { FEEDBACK_OPTIONS, optionOf } from './slow-moving-logic.js';
import { computeMetrics, filterFacts, customerKey, STATUSES } from './slow-moving-metrics.js';

const D = { loaded: false, loading: false, error: null, facts: [], sessions: [], m: null,
  f: { q: '', status: '', productId: '', repId: '', followupOnly: false }, limit: 40 };
const $ = id => document.getElementById(id);
const fmtPct = v => (v === null || v === undefined ? '—' : v + '%');
const fmtRp = v => (v == null ? '' : 'Rp ' + Number(v).toLocaleString('id-ID'));
const label = s => optionOf(s)?.label || s;
const tone = s => optionOf(s)?.tone || 'neutral';

async function load() {
  D.loading = true; D.error = null;
  try {
    const api = window.SlowMoving;
    [D.facts, D.sessions] = await Promise.all([api.fetchFacts(), api.fetchSessions()]);
    D.m = computeMetrics(D.facts, D.sessions);
    D.customerIndex = null; D.loaded = true;
  } catch (e) {
    console.error('slow-moving dashboard', e);
    D.error = window.SlowMoving.isNotSetUp(e)
      ? "Slow-Moving Products isn't set up on the server yet (database migration 0017 is not applied)."
      : (e.message || String(e));
  }
  D.loading = false; render();
}

// customer_key → { sales, code, group } so a row can open the existing Customer 360 modal.
function customerIndex() {
  if (D.customerIndex) return D.customerIndex;
  const idx = {};
  const list = typeof getRepCustomerList === 'function' ? getRepCustomerList() : [];
  for (const c of list) idx[customerKey(c.name, c.area)] = { sales: c.sales, code: c.code, group: c.group };
  return (D.customerIndex = idx);
}

function kpi(value, lab, hint) {
  return `<div class="smd-kpi"><b>${value}</b><span>${lab}</span>${hint ? `<small>${hint}</small>` : ''}</div>`;
}

function overallHtml(o) {
  const c = o.counts;
  return `<div class="sm-sec">Overall</div><div class="smd-kpis">
    ${kpi(o.completedSessions, 'Assessments')}${kpi(o.customersAssessed, 'Customers assessed')}
    ${kpi(fmtPct(o.completionRate), 'Completion rate', 'completed ÷ started')}
    ${kpi(c.interested, 'Interested')}${kpi(c.needs_sample, 'Sample opportunities')}
    ${kpi(c.price_too_high, 'Pricing objections')}${kpi(c.packaging_issue, 'Packaging objections')}
    ${kpi(c.uses_competitor, 'Competitor-related')}${kpi(c.not_interested, 'Not interested')}
    ${kpi(c.not_applicable, 'Not applicable')}</div>`;
}

function productsHtml(products) {
  if (!products.length) return '';
  const cols = STATUSES.filter(s => s !== 'not_applicable');
  const short = { uses_competitor: 'Competitor', not_familiar: 'Not familiar' };
  const head = cols.map(s => `<th>${short[s] || label(s)}</th>`).join('');
  const rows = products.map(p => `<tr onclick="SMDash.pickProduct('${p.product_id}')" class="smd-click">
      <td class="smd-name"><b>${escHtml(p.name)}</b><small>${escHtml(p.packaging)} · ${p.assessed} assessed</small></td>
      ${cols.map(s => `<td>${p.counts[s]}<small>${fmtPct(p.share[s])}</small></td>`).join('')}
      <td>${p.counts.not_applicable}<small>${fmtPct(p.naShare)}</small></td></tr>`).join('');
  return `<div class="sm-sec">By product</div>
    <div class="smd-scroll"><table class="smd-table"><thead><tr><th>Product</th>${head}<th>N/A</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="smd-note">Percentages = count ÷ assessed (answers excluding Not applicable). N/A % is its share of all answers. Tap a product to filter the feedback list.</div>`;
}

function repsHtml(reps) {
  if (!reps.length) return '';
  return `<div class="sm-sec">Salespeople</div><div class="smd-scroll"><table class="smd-table"><thead><tr>
    <th>Rep</th><th>Customers</th><th>Completion</th><th>Detail</th><th>Interested</th><th>Samples</th><th>Follow-ups</th></tr></thead><tbody>
    ${reps.map(r => `<tr><td class="smd-name"><b>${escHtml(r.name)}</b><small>${r.completed}/${r.started} completed</small></td>
      <td>${r.customers}</td><td>${fmtPct(r.completionRate)}</td><td>${fmtPct(r.detailRate)}</td><td>${r.interested}</td><td>${r.samples}</td><td>${r.followups}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="smd-note">Completion = completed ÷ started. Detail = share of actionable answers with a comment or detail filled — measures information quality, not positivity.</div>`;
}

function listHtml(title, rows, fmt) {
  return `<div class="smd-ins"><h4>${title}</h4>${rows.length ? rows.map(fmt).join('') : '<small class="smd-empty">No data yet</small>'}</div>`;
}
function insightsHtml(i) {
  const prod = p => `<div class="smd-li"><span>${escHtml(p.name)} <small>${escHtml(p.packaging)}</small></span><b>${fmtPct(p.share.interested)}</b><small>n=${p.assessed}</small></div>`;
  return `<div class="sm-sec">Market insights</div><div class="smd-ins-grid">
    ${listHtml('Most common objections', i.objections, o => `<div class="smd-li"><span>${label(o.status)}</span><b>${o.count}</b><small>${fmtPct(o.share)}</small></div>`)}
    ${listHtml('Requested packaging', i.packaging, p => `<div class="smd-li"><span>${escHtml(p.label)}</span><b>${p.count}</b></div>`)}
    ${listHtml('Competitor brands', i.competitors, p => `<div class="smd-li"><span>${escHtml(p.label)}</span><b>${p.count}</b></div>`)}
    ${listHtml('Highest interest', i.highInterest, prod)}
    ${listHtml('Low demand', i.lowDemand, prod)}
    ${listHtml('Needs pricing intervention', i.pricingIntervention, p => `<div class="smd-li"><span>${escHtml(p.name)} <small>${escHtml(p.packaging)}</small></span><b>${p.count}</b><small>${p.avgTarget ? 'target ~' + fmtRp(p.avgTarget) : fmtPct(p.share)}</small></div>`)}
    ${listHtml('Needs product education', i.education, p => `<div class="smd-li"><span>${escHtml(p.name)} <small>${escHtml(p.packaging)}</small></span><b>${p.count}</b><small>${p.opportunity} see opportunity</small></div>`)}
  </div><div class="smd-note">${i.followupsOpen} answer${i.followupsOpen === 1 ? '' : 's'} flagged for follow-up. Interest % ranks use only products with answers; n = assessed answers.</div>`;
}

function feedbackHtml() {
  const rows = filterFacts(D.facts, D.f);
  const idx = customerIndex();
  const opt = (v, t, sel) => `<option value="${escHtml(v)}"${sel === v ? ' selected' : ''}>${escHtml(t)}</option>`;
  const prods = [...new Map(D.facts.map(f => [f.product_id, f])).values()].sort((a, b) => a.display_order - b.display_order);
  const reps = [...new Map(D.facts.map(f => [f.rep_id, f.rep_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const groups = [...rows.reduce((m, f) => m.set(f.customer_key, [...(m.get(f.customer_key) || []), f]), new Map()).values()];
  const item = f => {
    const details = [f.target_price != null && 'Target ' + fmtRp(f.target_price), f.requested_packaging && 'Packaging: ' + f.requested_packaging,
      f.competitor_brand && 'Competitor: ' + f.competitor_brand, f.estimated_monthly_volume != null && 'Volume ' + f.estimated_monthly_volume + '/mo',
      f.target_purchase_date && 'Buy by ' + f.target_purchase_date, f.sample_requirements && 'Sample: ' + f.sample_requirements,
      f.rejection_reason && 'Reason: ' + f.rejection_reason, f.not_applicable_reason && 'N/A: ' + f.not_applicable_reason, f.explanation].filter(Boolean);
    return `<div class="smd-fb-item">
      <div class="smd-fb-top"><div class="smd-fb-prod">${escHtml(f.product_name)} · ${escHtml(f.packaging)}${f.followup_required ? ' · <b class="smd-flag">Follow-up</b>' : ''}</div>
        <span class="sm-chip sm-tone-${tone(f.feedback_status)}">${escHtml(label(f.feedback_status))}</span></div>
      ${details.length ? `<div class="smd-fb-det">${details.map(escHtml).join(' · ')}</div>` : ''}
      ${f.customer_comment ? `<div class="smd-fb-cmt">“${escHtml(f.customer_comment)}”</div>` : ''}</div>`;
  };
  const cards = groups.slice(0, D.limit).map(g => {
    const f = g[0], c = idx[f.customer_key];
    const reps = [...new Set(g.map(x => x.rep_name))].join(', ');
    return `<details class="smd-fb"><summary class="smd-fb-top"><button class="smd-link" onclick="SMDash.openCustomer('${escHtml(f.customer_key)}')">${escHtml(f.customer_name)}</button>
        <span class="smd-fb-sum">${[...g.reduce((m, x) => m.set(x.feedback_status, (m.get(x.feedback_status) || 0) + 1), new Map())].map(([st, n]) => `<span class="sm-chip sm-tone-${tone(st)}">${escHtml(label(st))}${n > 1 ? ' ×' + n : ''}</span>`).join('')}
        <span class="smd-count">${g.length} product${g.length === 1 ? '' : 's'}</span></span></summary>
      <div class="smd-fb-meta">${escHtml(reps)} · ${escHtml(f.customer_area || '—')}${c?.group ? ' · ' + escHtml(c.group) : ''} · ${new Date(Math.max(...g.map(x => new Date(x.completed_at)))).toLocaleDateString('id-ID')}</div>
      ${g.map(item).join('')}</details>`;
  }).join('');
  return `<div class="sm-sec" id="smd-feedback">Customer feedback <span class="smd-count">${rows.length}</span></div>
    <input class="pl-search sm-search" id="smd-q" type="search" placeholder="Search customer, rep, product, comment…" value="${escHtml(D.f.q)}" oninput="SMDash.onQ(this.value)" autocomplete="off">
    <div class="smd-filters">
      <select class="sm-input" onchange="SMDash.setF('status',this.value)">${opt('', 'All answers', D.f.status)}${FEEDBACK_OPTIONS.map(o => opt(o.value, o.label, D.f.status)).join('')}</select>
      <select class="sm-input" onchange="SMDash.setF('productId',this.value)">${opt('', 'All products', D.f.productId)}${prods.map(p => opt(p.product_id, p.product_name + ' ' + p.packaging, D.f.productId)).join('')}</select>
      <select class="sm-input" onchange="SMDash.setF('repId',this.value)">${opt('', 'All salespeople', D.f.repId)}${reps.map(([id, n]) => opt(id, n, D.f.repId)).join('')}</select>
      <label class="sm-check"><input type="checkbox" ${D.f.followupOnly ? 'checked' : ''} onchange="SMDash.setF('followupOnly',this.checked)"> Follow-up only</label></div>
    <div id="smd-fb-list">${cards || '<div class="cust-empty">No matching feedback</div>'}</div>
    ${groups.length > D.limit ? `<button class="sm-secondary" onclick="SMDash.more()">Show more (${groups.length - D.limit} left)</button>` : ''}`;
}

function render() {
  const host = $('intel-list'); if (!host) return;
  const top = window.SM?.modeToggleHtml?.() || '';
  if (D.loading || (!D.loaded && !D.error)) {
    host.innerHTML = `<div class="sm-wrap">${top}<div class="cust-loading"><div class="cust-loading-spinner"></div><div class="cust-loading-txt">Loading dashboard…</div></div></div>`;
    if (!D.loading) load();
    return;
  }
  if (D.error) { host.innerHTML = `<div class="sm-wrap">${top}<div class="intel-form-error">${escHtml(D.error)}</div><button class="sm-secondary" onclick="SMDash.reload()">Retry</button></div>`; return; }
  if (!D.facts.length) {
    host.innerHTML = `<div class="sm-wrap">${top}<div class="sm-title">Slow-Moving Products Intelligence</div>
      <div class="cust-empty">No completed assessments yet. Results appear here as salespeople submit them.</div></div>`;
    return;
  }
  host.innerHTML = `<div class="sm-wrap smd">${top}<div class="sm-title">Slow-Moving Products Intelligence</div>
    ${overallHtml(D.m.overall)}${productsHtml(D.m.products)}${repsHtml(D.m.salespeople)}${insightsHtml(D.m.insights)}${feedbackHtml()}</div>`;
}

window.SMDash = {
  render,
  reload() { D.loaded = false; D.error = null; D.loading = false; render(); },
  onQ(v) { D.f.q = v; D.limit = 40; refreshList(); },
  setF(k, v) { D.f[k] = v; D.limit = 40; render(); },
  more() { D.limit += 40; render(); },
  pickProduct(id) { D.f.productId = id; D.limit = 40; render(); $('smd-feedback')?.scrollIntoView({ behavior: 'smooth' }); },
  openCustomer(key) {
    const c = customerIndex()[key];
    if (!c) { showToast("This customer isn't in your current customer list"); return; }
    openCustModal(c.sales, c.code);
  },
};
// Search keeps focus: only the list + count are re-rendered.
function refreshList() {
  const rows = filterFacts(D.facts, D.f);
  const tmp = document.createElement('div'); tmp.innerHTML = feedbackHtml();
  const list = tmp.querySelector('#smd-fb-list'), cur = $('smd-fb-list');
  if (list && cur) cur.innerHTML = list.innerHTML;
  const n = document.querySelector('#smd-feedback .smd-count'); if (n) n.textContent = rows.length;
}
