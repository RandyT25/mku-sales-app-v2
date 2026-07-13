/* ════════════════════════════════════════════════
   MKU · MKS SALES TEAM APP  —  sales.js
   Reads from: RAW (data.js)  +  PRODUCTS (products.js)
════════════════════════════════════════════════ */

// ── VOLUME TIERS (confirm with Cost Control) ──
const TIERS = [
  { label: '1–5 Cartons',  min:1,  max:5,   disc: 0,    note: 'Standard price' },
  { label: '6–10 Cartons', min:6,  max:10,  disc: 0.03, note: '3% discount' },
  { label: '11+ Cartons',  min:11, max:999, disc: 0.05, note: '5% off - confirm with CC' },
];

// ── PRICELIST CATEGORY ORDER (matches PDF order) ──
const CAT_ORDER_MKU = ['French Fries','Butter & Mozzarella','Cooking & Cream','Dry Goods Tomatoes','Olive Oil','Pasta','Pork Meat','Salmon','Japanese Sauce','Syrup','Fruit Crush','Tea','Beverage Powder','Gourmet Syrup','Frappe Powder','Fruit Concentrate','Beverage Commodity','Topping & Sauce','Ice Shaken Powder','Cocofreo Powder','Alcohol Beverage'];
const CAT_ORDER_MKS = ['Flour','Dairy','Barista Milk','Tomatoes','Salt & Sweetener','Chinese Sauce','Seafood','Processed Meat','Cured Meat','Frozen Meat','Wagyu','Nestle'];

// ── PUBLIC HOLIDAYS — no deliveries on these dates ──
const PUBLIC_HOLIDAYS = new Set([
  '2026-06-16', // Idul Adha
  '2026-07-07', // Tahun Baru Islam
  '2026-08-17', // Hari Kemerdekaan RI
  '2026-09-15', // Maulid Nabi
  '2026-12-25', // Natal
  '2026-12-26', // Cuti bersama Natal
]);

// ── AVATAR COLORS ──
const COLORS = ['#C8242A','#163C70','#1A7A45','#B07D1A','#6B3FA0','#1A6B7A','#7A3A1A','#2A6BB0','#8B1A5A','#2A7A2A','#5A4A1A','#1A4A6B','#6B1A3A','#3A7A3A'];

// ── STOCK SEARCH STATE ──
let stockSearch = '';

// ── REP CONFIG (from real data) ──
const REP_CONFIG = [
  { name:'Picrom',         area:'UBUD',                   div:'MKS' },
  { name:'I Made Luih',   area:'DENPASAR - SANUR',        div:'MKS' },
  { name:'Juni',           area:'KUTA SEL - ULUWATU',     div:'MKS' },
  { name:'Lani',           area:'KUTA - INDUSTRI / HOTEL',div:'MKS' },
  { name:'Monica',         area:'KUTA SEL - NUSA DUA',    div:'MKS' },
  { name:'Sujana',         area:'SEMINYAK',                div:'MKS' },
  { name:'Eka',            area:'KUTA - LEGIAN',          div:'MKS' },
  { name:'Taufik',         area:'CANGGU 1',               div:'MKS' },
  { name:'Dewi Kristiani', area:'CANGGU 2',               div:'MKS' },
  { name:'Wira',           area:'GT + FOODY',             div:'MKS' },
  { name:'Sriasih',        area:'MODERN + GT',            div:'MKS' },
  { name:'Ridwan',         area:'NP-1 (Nestlé)',          div:'MKS' },
  { name:'Redi',           area:'NP-2 (Nestlé)',          div:'MKS' },
  { name:'Gek Mas',        area:'NP-3 (Nestlé)',          div:'MKS' },
];

// ── STATE ──
let currentRep   = null;
let currentTab   = 'target';
let plDiv        = 'MKU';
let plCat        = 'ALL';
let plSearch     = '';
let stockDiv     = 'MKU';
let stockFilter  = 'all';
let orderItems   = {};   // { productId: qty }
let activeProduct = null;
let _tkLang = 'id';    // toolkit language: 'en' | 'id'

// ── HELPERS ──
const fmt = n => n ? 'Rp ' + Math.round(n).toLocaleString('id-ID') : '—';
const fmtShort = n => {
  if (!n) return '—';
  if (n >= 1e9) return 'Rp ' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return 'Rp ' + (n/1e6).toFixed(1) + 'Jt';
  if (n >= 1e3) return 'Rp ' + Math.round(n/1e3) + 'K';
  return 'Rp ' + n;
};
const fmtNum = n => n ? Math.round(n).toLocaleString('id-ID') : '0';

// Time factor: % of month elapsed based on data date (e.g. day 3 of 30 = 10%)
function timeFactor() {
  if (typeof RAW === 'undefined') return 10;
  const d = new Date(RAW.latest + 'T00:00:00');
  return (d.getDate() / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) * 100;
}
// Color/tag based on pace: green = on/ahead of pace, gold = within 30% behind, red = lagging
const pctColor = p => { const tf = Math.floor(timeFactor()); return p >= tf ? 'var(--green)' : p >= tf * 0.7 ? 'var(--gold)' : 'var(--red)'; };
const pctTag   = p => { const tf = Math.floor(timeFactor()); return p >= tf ? 'good' : p >= tf * 0.7 ? 'warn' : 'low'; };

// Bilingual toolkit helpers — extracts current language (default English)
const T    = obj => { if (typeof obj === 'string') return obj; const lg = typeof _tkLang !== 'undefined' ? _tkLang : 'en'; return obj?.[lg] || obj?.en || ''; };
const TArr = obj => { if (Array.isArray(obj)) return obj; const lg = typeof _tkLang !== 'undefined' ? _tkLang : 'en'; return obj?.[lg] || obj?.en || []; };
const tierPrice = (base, idx) => Math.round(base * (1 - TIERS[idx].disc));

// ── CATEGORY ICONS (replaces emoji — inline SVG, matches bottom-nav style) ──
const CAT_ICON_PATHS = {
  fries:       '<path d="M7 10l1 10h8l1-10"/><path d="M12 4v8M9 6v8M15 6v8"/>',
  cheese:      '<path d="M3 17l9-11 9 11H3z"/><circle cx="12" cy="14" r="1"/><circle cx="9" cy="15.5" r="1"/><circle cx="15" cy="15.5" r="1"/>',
  milk:        '<path d="M8 3h8l-1 4H9L8 3z"/><path d="M7 7h10l-1 13a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1L7 7z"/>',
  tomato:      '<circle cx="12" cy="14" r="7"/><path d="M12 7c-1-2-3-3-4-2M12 7c1-2 3-3 4-2"/>',
  oilBottle:   '<path d="M10 2h4v3l2 2v13a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7l2-2V2z"/><path d="M9 12h6"/>',
  pasta:       '<path d="M4 12a8 6 0 0 0 16 0"/><path d="M3 12h18"/><path d="M8 8c1-2 2-2 2 0M12 8c1-2 2-2 2 0M16 8c1-2 2-2 2 0"/>',
  meat:        '<path d="M14 4a4 4 0 0 1 4 4c0 2-1 3-3 5l-4 4a2.5 2.5 0 1 1-3.5-3.5l4-4c2-2 3-3 5-3z"/><circle cx="8" cy="16" r="1"/>',
  fish:        '<path d="M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5z"/><circle cx="16" cy="11" r="1"/><path d="M3 12l-2-3v6l2-3z"/>',
  sauceBottle: '<path d="M9 2h6v3H9V2z"/><path d="M8 5h8l1 4v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l1-4z"/><circle cx="12" cy="14" r="1"/>',
  syrupBottle: '<path d="M10 2h4v4h-4V2z"/><path d="M9 6h6v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6z"/>',
  droplet:     '<path d="M12 3s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z"/>',
  leaf:        '<path d="M5 21c9 0 14-5 14-14V5h-2C8 5 5 12 5 21z"/><path d="M5 21c3-6 6-9 12-12"/>',
  cupStraw:    '<path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z"/><path d="M5 8h14l1-3H4l1 3z"/><path d="M14 3v3"/>',
  coffeeCup:   '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z"/><path d="M17 9h1a3 3 0 0 1 0 6h-1"/><path d="M7 3s-1 1 0 2-1 2 0 2M11 3s-1 1 0 2-1 2 0 2"/>',
  coconut:     '<circle cx="12" cy="13" r="8"/><path d="M12 5v4M8 13h8M9 17l6-8"/>',
  wineGlass:   '<path d="M7 3h10l-1 6a4 4 0 0 1-8 0L7 3z"/><path d="M12 13v6M8 21h8"/>',
  wheat:       '<path d="M12 2v20"/><path d="M12 6c-2-1-3 0-4 1s0 3 1 4M12 6c2-1 3 0 4 1s0 3-1 4M12 11c-2-1-3 0-4 1s0 3 1 4M12 11c2-1 3 0 4 1s0 3-1 4"/>',
  saltShaker:  '<path d="M9 2h6l1 4H8l1-4z"/><path d="M8 6h8l1 13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L8 6z"/><circle cx="12" cy="11" r=".5" fill="currentColor"/><circle cx="10" cy="14" r=".5" fill="currentColor"/><circle cx="14" cy="14" r=".5" fill="currentColor"/>',
  cow:         '<path d="M7 8c-2 0-3 2-2 4l1 1v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5l1-1c1-2 0-4-2-4"/><path d="M9 8V6M15 8V6"/><circle cx="9.5" cy="12" r=".5" fill="currentColor"/><circle cx="14.5" cy="12" r=".5" fill="currentColor"/>',
  box:         '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
};
const CAT_ICON = {
  'French Fries':'fries','Butter & Mozzarella':'cheese','Cooking & Cream':'milk',
  'Dry Goods Tomatoes':'tomato','Olive Oil':'oilBottle','Pasta':'pasta',
  'Pork Meat':'meat','Salmon':'fish','Japanese Sauce':'sauceBottle',
  'Syrup':'syrupBottle','Fruit Crush':'droplet','Tea':'leaf',
  'Beverage Powder':'leaf','Gourmet Syrup':'syrupBottle','Frappe Powder':'cupStraw',
  'Beverage Commodity':'coffeeCup','Topping & Sauce':'sauceBottle','Ice Shaken Powder':'cupStraw',
  'Cocofreo Powder':'coconut','Fruit Concentrate':'droplet','Alcohol Beverage':'wineGlass',
  'Flour':'wheat','Dairy':'cheese','Barista Milk':'milk',
  'Tomatoes':'tomato','Chinese Sauce':'sauceBottle','Seafood':'fish',
  'Processed Meat':'meat','Cured Meat':'meat','Frozen Meat':'meat',
  'Wagyu':'cow','Nestle':'coffeeCup','Salt & Sweetener':'saltShaker',
};
function catIcon(category, size) {
  size = size || 16;
  const key = CAT_ICON[category] || 'box';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;vertical-align:-3px">${CAT_ICON_PATHS[key]}</svg>`;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ── DATA ACCESSORS ──
function getLatestData() {
  const latest = RAW.latest;
  return RAW.targets_by_date[latest];
}
function getStockData(div) {
  const latest = RAW.latest;
  const sd = RAW.stock_by_date[latest];
  return div === 'MKU' ? (sd.MKU_full || sd.MKU || []) : (sd.MKS_full || sd.MKS || []);
}
function getStockItem(productName) {
  // Try to find a stock entry matching product name (fuzzy)
  const allStock = [...(RAW.stock_by_date[RAW.latest].MKU_full || []),
                    ...(RAW.stock_by_date[RAW.latest].MKS_full || [])];
  const pname = productName.toLowerCase();
  return allStock.find(s => s.name && pname.includes(s.name.toLowerCase().substring(0,8)));
}
function getTodaySO(repName) {
  // Exact match first (case/whitespace-insensitive via _norm), then fuzzy fallback for name variants
  const repNorm = _norm(repName);
  const exact = RAW.so.filter(s => s.date === RAW.latest && s.sales && _norm(s.sales) === repNorm);
  if (exact.length > 0) return exact;
  // Fallback: match on full name parts (not just first word)
  const parts = repName.toLowerCase().split(' ').filter(w => w.length > 2);
  return RAW.so.filter(s => s.date === RAW.latest && s.sales &&
    parts.every(p => s.sales.toLowerCase().includes(p)));
}

function getFJData(repName, useTodayOnly) {
  const all = useTodayOnly
    ? [ ...(typeof FJ_MKU_TODAY !== 'undefined' ? FJ_MKU_TODAY : []),
        ...(typeof FJ_MKS_TODAY !== 'undefined' ? FJ_MKS_TODAY : []) ]
    : [ ...(typeof FJ_MKU !== 'undefined' ? FJ_MKU : []),
        ...(typeof FJ_MKS !== 'undefined' ? FJ_MKS : []) ];
  if (!all.length) return [];
  // Carry forward SO header fields — continuation rows for the same SO leave these blank
  let lastSO = '', lastCust = '', lastSales = '', lastWilayah = '', lastDate = null;
  const normalized = all.map(r => {
    const noSO = String(r['No. SO'] || '').trim();
    const rawDate = r['Tgl. Kirim'];
    // Parse date: Date object (cellDates:true), Excel serial number, or string fallback
    const parsedDate = rawDate instanceof Date ? rawDate
      : (typeof rawDate === 'number' ? new Date((rawDate - 25569) * 86400 * 1000)
      : (typeof rawDate === 'string' && rawDate ? new Date(rawDate) : null));
    const delivDate = (parsedDate && !isNaN(parsedDate)) ? parsedDate : null;
    if (noSO) {
      lastSO      = noSO;
      lastCust    = String(r['Nama Cust']  || '').trim();
      lastSales   = String(r['Nama Sales'] || '').trim();
      lastWilayah = String(r['Wilayah']    || '').trim();
      if (delivDate) lastDate = delivDate;
    }
    // Case-insensitive KET lookup so 'Ket', 'ket', 'KET' all work
    const _ketKey = Object.keys(r).find(k => k.toUpperCase() === 'KET') || '';
    return {
      no_so:         noSO || lastSO,
      tgl_kirim:     String(rawDate || ''),
      delivery_date: delivDate || lastDate, // carry forward from SO header row
      nama_cust:     String(r['Nama Cust']  || '').trim() || lastCust,
      nama_sales:    String(r['Nama Sales'] || '').trim() || lastSales,
      wilayah:       String(r['Wilayah']    || '').trim() || lastWilayah,
      kode_brg:      String(r['Kode Brg']   || '').trim(),
      nama_brg:      String(r['Nama Brg']   || '').trim(),
      qty_so:        parseFloat(r['Qty SO']  || 0),
      qty_bs:        parseFloat(r['Qty BS']  || 0),
      satuan:        String(r['Satuan'] || '').trim(),
      ket:           String(r[_ketKey]  || '').toUpperCase().trim()
    };
  }).filter(r => r.nama_brg); // drop empty rows
  // Filter by rep (same fuzzy match as getTodaySO)
  if (!repName || repName === 'Management Bali') return normalized;
  const exact = normalized.filter(r => r.nama_sales === repName);
  if (exact.length) return exact;
  const parts = repName.toLowerCase().split(' ').filter(w => w.length > 2);
  return normalized.filter(r => r.nama_sales && parts.every(p => r.nama_sales.toLowerCase().includes(p)));
}

// Build ERP-code → product-name map from FJ data (FJ has both kode_brg + nama_brg)
var _fjNameMap = null;
function _getFJNameMap() {
  if (_fjNameMap) return _fjNameMap;
  _fjNameMap = {};
  const all = [
    ...(typeof FJ_MKU !== 'undefined' ? FJ_MKU : []),
    ...(typeof FJ_MKS !== 'undefined' ? FJ_MKS : [])
  ];
  all.forEach(r => {
    const code = String(r['Kode Brg'] || '').trim();
    const name = String(r['Nama Brg'] || '').trim();
    if (code && name) _fjNameMap[code.toLowerCase()] = name;
  });
  return _fjNameMap;
}

function getProductName(code) {
  if (!code) return '—';
  if (code.includes(' ')) return code; // already a readable name
  // Try PRODUCTS pricelist first (MKU001/MKS001 style IDs)
  if (typeof PRODUCTS !== 'undefined') {
    const p = PRODUCTS.find(p => p.id && p.id.toLowerCase().trim() === code.toLowerCase().trim());
    if (p) return p.name;
  }
  // Try FJ name map (ERP codes like 080241, PSJ0007)
  const fjMap = _getFJNameMap();
  if (fjMap[code.toLowerCase()]) return fjMap[code.toLowerCase()];
  // Try stock data (ERP codes that appear in RAW.so but not in FJ delivery)
  const sd = RAW?.stock_by_date?.[RAW.latest];
  if (sd) {
    const all = [...(sd?.MKU_full || sd?.MKU || []), ...(sd?.MKS_full || sd?.MKS || [])];
    const match = all.find(x => x.code === code);
    if (match) return match.name;
  }
  return code;
}

function isFJStale(lines) {
  if (!lines.length) return true;
  const today = new Date(); today.setHours(0,0,0,0);
  const maxDate = lines.reduce((m,r) => (r.delivery_date && r.delivery_date > m ? r.delivery_date : m), new Date(0));
  // strict < so today's file (delivery_date === today) is NOT stale
  return maxDate < today;
}

function _tok(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 1);
}
function _tokScore(a, b) {
  const ta = new Set(_tok(a));
  return _tok(b).filter(w => ta.has(w)).length;
}
// normalize internal whitespace for name comparisons (handles double-spaces from Excel)
const _norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();

const _CASE_UNITS = new Set(['KTN','SACK','BOX','CRT','CTN']);

// Pricelist price for a product — used as a sanity cap for historical prices
function _plLookupPrice(nama_brg, satuan) {
  if (typeof PRODUCTS === 'undefined' || !nama_brg) return 0;
  const nb = nama_brg.toLowerCase();
  const su = (satuan || '').toUpperCase().trim();
  let bestMatch = null, bestScore = 0;
  for (const p of PRODUCTS) {
    if (!p.name) continue;
    const score = _tokScore(nb, p.name);
    if (score >= 2 && score > bestScore) { bestScore = score; bestMatch = p; }
  }
  if (!bestMatch) return 0;
  return (su && _CASE_UNITS.has(su) && bestMatch.priceCase) ? bestMatch.priceCase : (bestMatch.priceUnit || 0);
}

function _fjLookupRevenue(no_so, kode_brg, nama_brg, qty_so, satuan) {
  if (!qty_so || !RAW?.so?.length) return 0;
  const kb = (kode_brg || '').toLowerCase().trim();
  const su = (satuan || '').toUpperCase().trim();
  const plPrice = _plLookupPrice(nama_brg, satuan);
  // Sanity-cap: if historical unit price is >5× the pricelist price, use pricelist instead
  const _histRev = entry => {
    const unitPrice = entry.revenue / entry.so_pcs;
    if (plPrice && unitPrice > plPrice * 5) return plPrice * qty_so;
    return unitPrice * qty_so;
  };
  // 1. Exact SO + exact product code
  if (kb) {
    const exact = RAW.so.find(s => s.no_so === no_so && s.product && s.product.toLowerCase().trim() === kb);
    if (exact && exact.so_pcs > 0) return _histRev(exact);
  }
  // 1b. Exact SO + product name match
  if (nama_brg) {
    const nb = nama_brg.toLowerCase().trim();
    const exactByName = RAW.so.find(s => s.no_so === no_so && s.product && s.product.toLowerCase().trim() === nb);
    if (exactByName && exactByName.so_pcs > 0) return _histRev(exactByName);
  }
  // 2. Historical ERP code match
  if (kb) {
    const hist = RAW.so.find(s => s.so_pcs > 0 && s.product && s.product.toLowerCase().trim() === kb);
    if (hist) return _histRev(hist);
  }
  // 2b. Historical name match: exact → prefix → token fuzzy (unit-preferred)
  if (nama_brg) {
    const nb = _norm(nama_brg);
    const histExact = RAW.so.find(s => s.so_pcs > 0 && s.product && _norm(s.product) === nb);
    if (histExact) return _histRev(histExact);
    if (nb.length >= 10) {
      const histPrefix = RAW.so.find(s => s.so_pcs > 0 && s.product && _norm(s.product).startsWith(nb));
      if (histPrefix) return _histRev(histPrefix);
    }
    // token fuzzy — prefer same unit; threshold 2 handles short names like "Borello Rump"
    let bestHist = null, bestHistScore = 0;
    for (const s of RAW.so) {
      if (!s.so_pcs || !s.product) continue;
      let score = _tokScore(nb, s.product);
      if (su && s.unit && s.unit.toUpperCase() === su) score += 2;
      if (score >= 2 && score > bestHistScore) { bestHistScore = score; bestHist = s; }
    }
    if (bestHist) return _histRev(bestHist);
  }
  // 3. PRODUCTS pricelist fallback
  if (plPrice) return plPrice * qty_so;
  return 0;
}

function buildTomorrowDeliveryHtml(lines) {
  if (isFJStale(lines)) {
    return `<div class="today-card">
      <div class="tc-title tc-title-tomorrow">🚚 Tomorrow's Deliveries</div>
      <div class="tc-coming-soon">Warehouse file not yet uploaded · check back later</div>
    </div>`;
  }
  const _now = new Date(); _now.setHours(0,0,0,0);
  const _maxD = lines.reduce((m,r) => (r.delivery_date && r.delivery_date > m ? r.delivery_date : m), new Date(0));
  // Normalize to local midnight — SheetJS dates are UTC midnight, so comparing directly
  // against local midnight (_now) is wrong in UTC+ timezones (e.g. Bali UTC+8 = 8h gap).
  const _maxDNorm = new Date(_maxD); _maxDNorm.setHours(0,0,0,0);
  // FJ file has today's dates (fallback) — tomorrow's plan not uploaded yet
  if (!(_maxDNorm > _now)) {
    return `<div class="today-card">
      <div class="tc-title tc-title-tomorrow">🚚 Tomorrow's Deliveries</div>
      <div class="tc-coming-soon">Tomorrow's delivery plan not yet uploaded · check back later</div>
    </div>`;
  }
  const custMap = {}, custOrder = [];
  const soMap = {}, soOrder = [];
  lines.forEach(r => {
    const soKey = r.no_so;
    if (!soMap[soKey]) { soMap[soKey] = { no_so: r.no_so, customer: r.nama_cust, items: [], total: 0, hasUnfulfilled: false, hasPartial: false }; soOrder.push(soKey); }
    const effQty = r.qty_bs > 0 ? r.qty_bs : r.qty_so;
    const rev = _fjLookupRevenue(r.no_so, r.kode_brg, r.nama_brg, effQty, r.satuan);
    soMap[soKey].items.push({ ...r, rev });
    soMap[soKey].total += rev;
    if (r.ket === 'UNFULFILLED') soMap[soKey].hasUnfulfilled = true;
    if (r.qty_bs > 0 && Math.round(r.qty_bs) < Math.round(r.qty_so)) soMap[soKey].hasPartial = true;
    if (!custMap[r.nama_cust]) { custMap[r.nama_cust] = { sos: [], total: 0 }; custOrder.push(r.nama_cust); }
  });
  soOrder.forEach(k => {
    const so = soMap[k];
    if (!custMap[so.customer].sos.find(s => s.no_so === k)) custMap[so.customer].sos.push(so);
    custMap[so.customer].total += so.total;
  });
  const totalRev = Object.values(custMap).reduce((s, c) => s + c.total, 0);
  const uniqueSOs = soOrder.length;
  const _tmr = new Date(); _tmr.setDate(_tmr.getDate() + 1); _tmr.setHours(0,0,0,0);
  const _fjLabel = _maxDNorm.getTime() === _tmr.getTime()
    ? "Tomorrow's Deliveries"
    : 'Deliveries · ' + _maxDNorm.toLocaleDateString('id-ID', { weekday:'short', day:'numeric', month:'short' });
  let h = `<div class="today-card">
    <div class="tc-title tc-title-tomorrow">🚚 ${_fjLabel} · ${fmtShort(totalRev)} (${uniqueSOs} SO · ${custOrder.length} Cust)</div>
    <div class="tc-so">`;
  custOrder.forEach(cust => {
    const c = custMap[cust];
    h += `<div class="tc-so-group"><div class="tc-so-cust-hdr"><div class="tc-so-cust">${cust}</div><div class="tc-so-cust-total">${fmtShort(c.total)}</div></div>`;
    c.sos.forEach(g => {
      const stClass = g.hasUnfulfilled ? 'critical' : (g.hasPartial ? 'low' : 'ok');
      const stLabel = g.hasUnfulfilled ? 'Partial/Unfulfilled' : (g.hasPartial ? 'Partial' : 'Fulfilled');
      h += `<div class="tc-so-subgroup"><div class="tc-so-subhdr"><div class="tc-so-no">${g.no_so}</div><div class="tc-so-status ${stClass}">${stLabel}</div></div>`;
      g.items.forEach(o => {
        const flagHtml = o.ket === 'UNFULFILLED' ? `<div class="tc-so-ket critical">UNFULFILLED</div>` : '';
        const isPartial = o.qty_bs > 0 && Math.round(o.qty_bs) < Math.round(o.qty_so);
        const qtyDisplay = isPartial ? `${fmtNum(o.qty_bs)} / ${fmtNum(o.qty_so)} ${o.satuan}` : `${fmtNum(o.qty_so)} ${o.satuan}`;
        const revHtml = o.rev > 0 ? `<div class="tc-so-rev">${fmtShort(o.rev)}</div>` : '';
        h += `<div class="tc-so-row"><div class="tc-so-prod">${o.nama_brg}</div><div class="tc-so-qty${isPartial ? ' low' : ''}">${qtyDisplay}</div>${flagHtml}${revHtml}</div>`;
      });
      h += `</div>`;
    });
    h += `</div>`;
  });
  h += `</div></div>`;
  return h;
}

function buildUnfulfilledHtml(lines) {
  if (!lines.length) return ''; // no FJ data at all
  if (isFJStale(lines)) return ''; // today's file not yet fresh — don't show possibly-resolved old items
  const unfulfilled = lines.filter(r => r.ket === 'UNFULFILLED');
  if (!unfulfilled.length) {
    return `<div class="today-card tc-unfulfilled-ok">
      <div class="tc-title" style="color:var(--green)">✓ Unfulfilled · All items fulfilled</div>
    </div>`;
  }
  // Calculate lost revenue: unit_price from RAW.so (revenue ÷ so_pcs) × unfulfilled qty
  let totalLost = 0;
  const lostLines = unfulfilled.map(r => {
    const lost = _fjLookupRevenue(r.no_so, r.kode_brg, r.nama_brg, r.qty_so, r.satuan);
    totalLost += lost;
    return { ...r, lost_rev: lost };
  });
  // Group by customer
  const custMap = {}, custOrder = [];
  lostLines.forEach(r => {
    if (!custMap[r.nama_cust]) { custMap[r.nama_cust] = { items: [], total: 0 }; custOrder.push(r.nama_cust); }
    custMap[r.nama_cust].items.push(r);
    custMap[r.nama_cust].total += r.lost_rev;
  });
  let h = `<div class="today-card tc-unfulfilled">
    <div class="tc-title tc-title-lost"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg> Unfulfilled · ${fmtShort(totalLost)} lost (${unfulfilled.length} items)</div>
    <div class="tc-so">`;
  custOrder.forEach(cust => {
    const c = custMap[cust];
    h += `<div class="tc-so-group"><div class="tc-so-cust-hdr"><div class="tc-so-cust">${cust}</div><div class="tc-so-cust-total tc-lost-total">${fmtShort(c.total)}</div></div>`;
    c.items.forEach(r => {
      h += `<div class="tc-so-row"><div class="tc-so-prod">${r.nama_brg}</div><div class="tc-so-qty">${fmtNum(r.qty_so)} ${r.satuan}</div><div class="tc-so-rev">${r.lost_rev > 0 ? fmtShort(r.lost_rev) : '—'}</div></div>`;
    });
    h += `</div>`;
  });
  h += `</div></div>`;
  return h;
}

function buildTodaySOHtml(lines) {
  if (!lines.length) return '';
  // Step 1: group lines by SO number
  const soMap = {};
  const soOrder = [];
  lines.forEach(o => {
    const soKey = o.no_so || (o.customer + '|so');
    if (!soMap[soKey]) { soMap[soKey] = { no_so: o.no_so, customer: o.customer, status: o.status, items: [], total: 0 }; soOrder.push(soKey); }
    soMap[soKey].items.push(o);
    soMap[soKey].total += (o.revenue || 0);
  });
  // Step 2: group SOs by customer name
  const custMap = {};
  const custOrder = [];
  soOrder.forEach(soKey => {
    const so = soMap[soKey];
    if (!custMap[so.customer]) { custMap[so.customer] = { sos: [], total: 0 }; custOrder.push(so.customer); }
    custMap[so.customer].sos.push(so);
    custMap[so.customer].total += so.total;
  });
  const totalRev = lines.reduce((s, o) => s + (o.revenue || 0), 0);
  const uniqueSOs = soOrder.length;
  const statusColor = { 'Sudah Jadi FJ': 'ok', 'Pending': 'low', 'Batal': 'out' };
  let h = `<div class="today-card">
    <div class="tc-title">Today's Orders · ${fmtShort(totalRev)} (${uniqueSOs} SO · ${custOrder.length} Cust)</div>
    <div class="tc-so">`;
  custOrder.forEach(cust => {
    const c = custMap[cust];
    h += `<div class="tc-so-group">
      <div class="tc-so-cust-hdr">
        <div class="tc-so-cust">${cust}</div>
        <div class="tc-so-cust-total">${fmtShort(c.total)}</div>
      </div>`;
    c.sos.forEach(g => {
      const stClass = statusColor[g.status] || 'low';
      h += `<div class="tc-so-subgroup">
        <div class="tc-so-subhdr">
          <div class="tc-so-no">${g.no_so || ''}</div>
          <div class="tc-so-status ${stClass}">${g.status || ''}</div>
        </div>`;
      g.items.forEach(o => {
        h += `<div class="tc-so-row">
          <div class="tc-so-prod">${getProductName(o.product)}</div>
          <div class="tc-so-qty">${fmtNum(o.so_pcs)} ${o.unit}</div>
          <div class="tc-so-rev">${fmtShort(o.revenue)}</div>
        </div>`;
      });
      h += `</div>`;
    });
    h += `</div>`;
  });
  h += `</div></div>`;
  return h;
}

// ════════════════
// LOGIN
// ════════════════
function buildLogin() {
  const sel = document.getElementById('rep-select');
  if (!sel) return; // loading screen is showing, not ready yet
  // Add optgroups
  const fieldReps = REP_CONFIG.filter(r => !r.area.includes('Nestlé'));
  const nestleReps = REP_CONFIG.filter(r => r.area.includes('Nestlé'));

  // Shorten area labels so they fit on one line
  const SHORT_AREA = {
    'UBUD':                    'Ubud',
    'DENPASAR - SANUR':        'Denpasar - Sanur',
    'KUTA SEL - ULUWATU':      'Kuta Sel - Uluwatu',
    'KUTA - INDUSTRI / HOTEL': 'Kuta Industri/Hotel',
    'KUTA SEL - NUSA DUA':     'Nusa Dua',
    'SEMINYAK':                'Seminyak',
    'KUTA - LEGIAN':           'Kuta Legian',
    'CANGGU 1':                'Canggu 1',
    'CANGGU 2':                'Canggu 2',
    'GT + FOODY':              'GT + Foody',
    'MODERN + GT':             'Modern + GT',
    'NP-1 (Nestlé)':           'NP-1',
    'NP-2 (Nestlé)':           'NP-2',
    'NP-3 (Nestlé)':           'NP-3',
  };

  let grp1 = document.createElement('optgroup');
  grp1.label = 'Field Sales';
  fieldReps.forEach(rep => {
    const idx = REP_CONFIG.indexOf(rep);
    const opt = document.createElement('option');
    opt.value = idx;
    const area = SHORT_AREA[rep.area] || rep.area;
    opt.textContent = rep.name + ' · ' + area;
    grp1.appendChild(opt);
  });

  let grp2 = document.createElement('optgroup');
  grp2.label = 'Nestlé Team';
  nestleReps.forEach(rep => {
    const idx = REP_CONFIG.indexOf(rep);
    const opt = document.createElement('option');
    opt.value = idx;
    const area = SHORT_AREA[rep.area] || rep.area;
    opt.textContent = rep.name + ' · ' + area;
    grp2.appendChild(opt);
  });

  sel.appendChild(grp1);
  sel.appendChild(grp2);

  const saved = localStorage.getItem('mkuv2_saved_rep');
  if (saved !== null) {
    const savedIdx = parseInt(saved);
    if (!isNaN(savedIdx) && REP_CONFIG[savedIdx]) {
      selectRep(savedIdx);
      return;
    }
  }
}

function onRepSelect(sel) {
  const btn = document.getElementById('login-enter-btn');
  btn.disabled = sel.value === '';
}

function doLogin() {
  const sel = document.getElementById('rep-select');
  const idx = parseInt(sel.value);
  if (isNaN(idx)) return;
  selectRep(idx);
}

function selectRep(idx) {
  try {
    currentRep = REP_CONFIG[idx];
    currentRep._color = COLORS[idx % COLORS.length];
    window._currentRep = currentRep.name;
    localStorage.setItem('mkuv2_saved_rep', String(idx));
    // Reset customer tab state
    _custGroup = 'all';
    _custQuery = '';
    window._custTabOpen = false;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('topbar-name').textContent = currentRep.name;
    document.getElementById('topbar-area').textContent = currentRep.area;
    const d = new Date(RAW.latest);
    document.getElementById('topbar-date').textContent =
      d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'2-digit' });
    try { renderTarget(); } catch(e) {
      console.error('renderTarget error:', e);
      document.getElementById('target-body').innerHTML =
        '<div style="padding:20px;color:red;font-size:.8rem">Target data error: ' + e.message + '</div>';
    }
    // If customers tab is already open, refresh it immediately for the new rep
    const custScreen = document.getElementById('screen-customers');
    if (custScreen && custScreen.classList.contains('active')) {
      initCustomers();
    }
    // #6 Auto-show panel if there are unread Urgent announcements
    if (typeof ANNOUNCEMENTS !== 'undefined') {
      const _read = getReadIds();
      const _hasUrgent = ANNOUNCEMENTS.some(a => a.category === 'Urgent' && !_read.includes(a.id));
      if (_hasUrgent) setTimeout(() => toggleAnnouncements(), 700);
    }
  } catch(e) {
    console.error('selectRep error:', e);
    alert('Login error: ' + e.message);
  }
}

function logout() {
  currentRep = null;
  window._currentRep = null;
  orderItems = {};
  localStorage.removeItem('mkuv2_saved_rep');
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  switchTab('target');
}

// ════════════════
// TAB NAVIGATION
// ════════════════
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.bnav').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + tab).classList.add('active');
  document.getElementById('bnav-' + tab).classList.add('active');
  if (tab === 'price') { renderPricelist(); }
  if (tab === 'stock') { renderStock(); }
  if (tab === 'order') { renderOrder(); }
  if (tab === 'customers') { initCustomers(); }
}

// ════════════════
// TARGET SCREEN
// ════════════════
// ── BADGE SYSTEM ──
function getBadges(repName, d) {
  const badges = [];

  // Get all areas for this rep (main only, no NN)
  const myAreas = d.area_targets.filter(a =>
    a.sales === repName && !a.area.includes('NAUGHTY NURIS')
  );

  // Nestlé rep — check nestle_areas
  const nestleEntry = d.nestle_areas.find(n => n.sales === repName);

  // Calculate overall pct
  let total_t = 0, total_a = 0;
  myAreas.forEach(a => {
    total_t += (a.food_target||0) + (a.bev_target||0);
    total_a += (a.food_ach||0) + (a.bev_ach||0);
  });
  if (nestleEntry) {
    total_t += nestleEntry.target || 0;
    total_a += nestleEntry.achievement || 0;
  }
  const pct = total_t > 0 ? Math.round(total_a / total_t * 100) : 0;

  // 🎯 On Target — 80%+
  if (pct >= 80) badges.push({ icon: '🎯', name: 'On Target', desc: 'Reached 80% of target' });

  // 🏆 Full Target — 100%+
  if (pct >= 100) badges.push({ icon: '🏆', name: 'Full Target', desc: 'Hit 100% of target!' });

  // 💎 Overachiever — 110%+
  if (pct >= 110) badges.push({ icon: '💎', name: 'Overachiever', desc: 'Exceeded 110% — outstanding!' });

  // 👑 Area King — #1 in leaderboard
  const mainAreas = d.area_targets.filter(a => !a.area.includes('NAUGHTY NURIS'));
  const sorted = [...mainAreas].sort((a,b) => b.pct - a.pct);
  if (sorted.length > 0 && sorted[0].sales === repName) {
    badges.push({ icon: '👑', name: 'Area King', desc: 'Top of the leaderboard this month!' });
  }

  return badges;
}

function getBadgeIcons(repName, d) {
  return getBadges(repName, d).map(b => b.icon).join('');
}

// ── REP TYPE HELPERS ──
const NESTLE_REPS  = ['Ridwan','Redi','Gek Mas'];
const NN_REPS      = { 'I Made Luih': 'NAUGHTY NURIS (SANUR)', 'Sujana': 'NAUGHTY NURIS (SEMINYAK)' };

function isNestleRep(name)  { return NESTLE_REPS.includes(name); }
function hasNNArea(name)    { return !!NN_REPS[name]; }

function renderTarget() {
  if (!currentRep) return;
  const d = getLatestData();
  const repName = currentRep.name;

  // ── NESTLÉ REPS: show only Nestlé data ──
  if (isNestleRep(repName)) {
    renderNestleTarget(d, repName);
    return;
  }

  // ── REGULAR REPS: find their areas (exclude Naughty Nuris) ──
  const myMainAreas = d.area_targets.filter(a =>
    a.sales === repName && !a.area.includes('NAUGHTY NURIS')
  );

  // Naughty Nuris area for this rep (if any)
  const myNNArea = d.area_targets.find(a =>
    a.sales === repName && a.area.includes('NAUGHTY NURIS')
  );

  // Aggregate main area totals only
  let food_target = 0, bev_target = 0, food_ach = 0, bev_ach = 0;
  myMainAreas.forEach(a => {
    food_target += a.food_target || 0;
    bev_target  += a.bev_target  || 0;
    food_ach    += a.food_ach    || 0;
    bev_ach     += a.bev_ach     || 0;
  });

  // If rep also has Naughty Nuris, add it separately as food
  let nn_target = 0, nn_ach = 0;
  if (myNNArea) {
    nn_target = myNNArea.food_target || 0;
    nn_ach    = myNNArea.food_ach    || 0;
  }

  // Overall % matches dashboard: main area only (food + bev), NN shown separately
  const main_target  = food_target + bev_target;
  const main_ach     = food_ach + bev_ach;
  const overall_pct  = main_target > 0 ? Math.round((main_ach / main_target) * 100) : 0;

  const gap80  = Math.max(0, main_target * 0.80 - main_ach);
  const gap100 = Math.max(0, main_target - main_ach);
  const tagCls = pctTag(overall_pct);
  const _tf = Math.floor(timeFactor());
  const tagLabel = overall_pct >= 100 ? '🎉 Target Hit!' : overall_pct >= _tf ? '🔥 On Pace' : overall_pct >= _tf * 0.7 ? '📈 Getting There' : '⚡ Push Harder';

  // Build mini cards
  const multiArea = myMainAreas.length > 1;
  let miniCardsHtml = '';

  if (multiArea) {
    // Multiple areas (e.g. Lani): show each area separately
    myMainAreas.forEach(a => {
      const at = (a.food_target||0) + (a.bev_target||0);
      const aa = (a.food_ach||0)   + (a.bev_ach||0);
      const ap = at > 0 ? Math.round(aa / at * 100) : 0;
      // Shorten area label
      const aLabel = a.area.replace('KUTA - ','').replace('KUTA SEL - ','');
      miniCardsHtml += '<div class="th-mini">' +
        '<div class="th-mini-label" style="font-size:.55rem">' + aLabel + '</div>' +
        '<div class="th-mini-val">' + fmtShort(aa) + '</div>' +
        '<div class="th-mini-pct" style="color:' + pctColor(ap) + '">' + ap + '%</div>' +
        '</div>';
    });
  } else {
    if (food_target > 0) miniCardsHtml +=
      '<div class="th-mini"><div class="th-mini-label">Food</div>' +
      '<div class="th-mini-val">' + fmtShort(food_ach) + '</div>' +
      '<div class="th-mini-pct" style="color:' + pctColor(Math.round(food_ach/food_target*100)) + '">' + Math.round(food_ach/food_target*100) + '%</div></div>';
    if (bev_target > 0) miniCardsHtml +=
      '<div class="th-mini"><div class="th-mini-label">Beverage</div>' +
      '<div class="th-mini-val">' + fmtShort(bev_ach) + '</div>' +
      '<div class="th-mini-pct" style="color:' + pctColor(Math.round(bev_ach/bev_target*100)) + '">' + Math.round(bev_ach/bev_target*100) + '%</div></div>';
  }
  // Always show NN mini card if rep has Naughty Nuris
  if (nn_target > 0) miniCardsHtml +=
    '<div class="th-mini"><div class="th-mini-label">N. Nuris</div>' +
    '<div class="th-mini-val">' + fmtShort(nn_ach) + '</div>' +
    '<div class="th-mini-pct" style="color:' + pctColor(Math.round(nn_ach/nn_target*100)) + '">' + Math.round(nn_ach/nn_target*100) + '%</div></div>';

  // #5 Data freshness
  const _dataAge = Math.round((new Date() - new Date(RAW.latest + 'T00:00:00')) / 86400000);
  const _freshColor = _dataAge === 0 ? 'var(--green)' : _dataAge === 1 ? 'var(--gold)' : 'var(--red)';
  const _freshLabel = _dataAge === 0 ? '● Live' : _dataAge === 1 ? '● 1d ago' : `● ${_dataAge}d ago`;

  // #9 Monthly achievement trend (last 4 months)
  const _allDates = RAW.dates || [];
  const _byMonth = {};
  _allDates.forEach(dt => { _byMonth[dt.slice(0,7)] = dt; });
  const _trendItems = Object.entries(_byMonth).slice(-4).map(([, dt]) => {
    const _da = RAW.targets_by_date[dt];
    if (!_da) return null;
    const _ar = (_da.area_targets||[]).filter(a => a.sales === repName && !a.area.includes('NAUGHTY NURIS'));
    if (!_ar.length) return null;
    const _ap = _ar[0].pct;
    return `<div class="th-trend-item" style="color:${pctColor(_ap)}">${dt.slice(5,7)}/${dt.slice(2,4)}<br><b>${_ap}%</b></div>`;
  }).filter(Boolean);
  const _trendHtml = _trendItems.length > 1
    ? `<div class="th-trend">${_trendItems.join('<div class="th-trend-sep">→</div>')}</div>`
    : '';

  // Hero
  document.getElementById('target-hero').innerHTML = `
    <div class="th-month">${RAW.month} · <span style="color:${_freshColor};font-size:.65rem">${_freshLabel}</span></div>
    <div class="th-rep">${repName}</div>
    <div class="th-overall">
      <div>
        <div class="th-pct" style="color:${pctColor(overall_pct)}">${overall_pct}%</div>
        <div class="th-pct-label">Overall</div>
      </div>
      <div>
        <div class="th-status-tag ${tagCls}">${tagLabel}</div>
        <div style="color:rgba(255,255,255,0.35);font-size:.68rem;margin-top:6px">${fmtShort(main_ach)} of ${fmtShort(main_target)}</div>
      </div>
    </div>
    <div class="th-mini-grid">${miniCardsHtml}</div>
    ${_trendHtml}`;

  let bodyHtml = '';

  // ── MILESTONE CARD ──
  bodyHtml += `<div class="milestone-card">
    <div class="mc-title">Progress to Milestones</div>
    <div class="mc-bars">`;

  const bars = [];
  if (multiArea) {
    const areaColors = ['#C8242A','#163C70','#1A7A45','#B07D1A'];
    myMainAreas.forEach((a, i) => {
      const at = (a.food_target||0) + (a.bev_target||0);
      const aa = (a.food_ach||0)   + (a.bev_ach||0);
      if (at > 0) bars.push({ label: a.area.replace('KUTA - ','').replace('KUTA SEL - ',''), ach: aa, tgt: at, color: areaColors[i % areaColors.length] });
    });
  } else {
    if (food_target > 0)  bars.push({ label:'Food',     ach:food_ach, tgt:food_target, color:'#C8242A' });
    if (bev_target > 0)   bars.push({ label:'Beverage', ach:bev_ach,  tgt:bev_target,  color:'#163C70' });
  }
  if (nn_target > 0) bars.push({ label:'Naughty Nuris', ach:nn_ach, tgt:nn_target, color:'#B07D1A' });

  bars.forEach(b => {
    const pct = b.tgt > 0 ? Math.min(100, (b.ach / b.tgt * 100)) : 0;
    bodyHtml += `<div class="mc-bar-row">
      <div class="mc-bar-top">
        <div class="mc-bar-label">${b.label}</div>
        <div class="mc-bar-nums">${fmtShort(b.ach)} / ${fmtShort(b.tgt)}</div>
      </div>
      <div class="mc-bar-bg">
        <div class="mc-bar-fill" style="width:${pct}%;background:${b.color}"></div>
      </div>
      <div class="mc-markers">
        <div class="mc-mark" style="left:80%"><div class="mc-mark-line"></div><div class="mc-mark-label">80%</div></div>
        <div class="mc-mark" style="left:99%"><div class="mc-mark-line"></div><div class="mc-mark-label">100%</div></div>
      </div>
    </div>`;
  });
  bodyHtml += `</div></div>`;

  // ── GAP CARD ──
  if (multiArea) {
    // Lani etc: show separate gap cards per area
    bodyHtml += '<div class="gap-card"><div class="gc-title">How Much More to Go</div>';
    myMainAreas.forEach(a => {
      const at = (a.food_target||0) + (a.bev_target||0);
      const aa = (a.food_ach||0) + (a.bev_ach||0);
      const g80  = Math.max(0, at * 0.80 - aa);
      const g100 = Math.max(0, at - aa);
      const aLabel = a.area.replace('KUTA - ','').replace('KUTA SEL - ','');
      bodyHtml += '<div class="gc-area-label">' + aLabel + '</div>' +
        '<div class="gc-grid">' +
        '<div class="gc-item"><div class="gc-label">To reach 80%</div>' +
        '<div class="gc-val" style="color:' + (g80===0?'var(--green)':'var(--gold)') + '">' + (g80===0?'✓ Done':fmtShort(g80)) + '</div>' +
        '<div class="gc-sub">' + (g80===0?'Milestone reached!':'Still needed') + '</div></div>' +
        '<div class="gc-item"><div class="gc-label">Daily rate to 80%</div>' +
        '<div class="gc-val" style="color:var(--gold)">' + (g80===0?'✓ Done':(daysLeft()>0?fmtShort(g80/daysLeft()):'—')) + '</div>' +
        '<div class="gc-sub">per day needed</div></div>' +
        '<div class="gc-item"><div class="gc-label">To reach 100%</div>' +
        '<div class="gc-val" style="color:' + (g100===0?'var(--green)':'var(--red)') + '">' + (g100===0?'✓ Done':fmtShort(g100)) + '</div>' +
        '<div class="gc-sub">' + (g100===0?'Target achieved!':'Still needed') + '</div></div>' +
        '<div class="gc-item"><div class="gc-label">Daily rate to 100%</div>' +
        '<div class="gc-val" style="color:var(--red)">' + (daysLeft()>0?fmtShort(g100/daysLeft()):'—') + '</div>' +
        '<div class="gc-sub">per day needed</div></div>' +
        '<div class="gc-item"><div class="gc-label">Days remaining</div>' +
        '<div class="gc-val">~' + daysLeft() + '</div>' +
        '<div class="gc-sub">in ' + RAW.month + '</div>' +
        (at > 0 && _tf > 0 ? '<div class="gc-sub" style="color:' + pctColor(Math.round(aa/at*100/_tf*100)) + '">proj. ~' + Math.round(aa/at*100/_tf*100) + '%</div>' : '') +
        '</div>' +
        '</div>';
    });
    bodyHtml += '</div>';
  } else {
    bodyHtml += `<div class="gap-card">
    <div class="gc-title">How Much More to Go</div>
    <div class="gc-grid">
      <div class="gc-item">
        <div class="gc-label">To reach 80%</div>
        <div class="gc-val" style="color:${gap80===0?'var(--green)':'var(--gold)'}">${gap80===0?'✓ Done':fmtShort(gap80)}</div>
        <div class="gc-sub">${gap80===0?'Milestone reached!':'Still needed'}</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">Daily rate to 80%</div>
        <div class="gc-val" style="color:var(--gold)">${gap80===0?'✓ Done':(daysLeft()>0?fmtShort(gap80/daysLeft()):'—')}</div>
        <div class="gc-sub">per day needed</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">To reach 100%</div>
        <div class="gc-val" style="color:${gap100===0?'var(--green)':'var(--red)'}">${gap100===0?'✓ Done':fmtShort(gap100)}</div>
        <div class="gc-sub">${gap100===0?'Target achieved!':'Still needed'}</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">Daily rate to 100%</div>
        <div class="gc-val" style="color:var(--red)">${daysLeft()>0?fmtShort(gap100/daysLeft()):'—'}</div>
        <div class="gc-sub">per day needed</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">Days remaining</div>
        <div class="gc-val">~${daysLeft()}</div>
        <div class="gc-sub">in ${RAW.month}</div>
        ${_tf > 0 ? `<div class="gc-sub" style="color:${pctColor(Math.round(overall_pct/_tf*100))}">proj. ~${Math.round(overall_pct/_tf*100)}%</div>` : ''}
      </div>
    </div>
  </div>`;
  }

  // ── AREA LEADERBOARD ──
  const mainAreas = d.area_targets.filter(a => !a.area.includes('NAUGHTY NURIS'));
  const nnAreas   = d.area_targets.filter(a =>  a.area.includes('NAUGHTY NURIS'));
  const sortedAreas = [...mainAreas].sort((a,b) => b.pct - a.pct);
  // #8 Previous-date ranking for change indicators
  const _prevDate = _allDates[_allDates.indexOf(RAW.latest) - 1];
  const _prevAreas = _prevDate && RAW.targets_by_date[_prevDate]
    ? RAW.targets_by_date[_prevDate].area_targets.filter(a => !a.area.includes('NAUGHTY NURIS'))
    : [];
  const _prevRankMap = {};
  [..._prevAreas].sort((a,b) => b.pct - a.pct).forEach((a, i) => {
    if (!_prevRankMap[a.sales]) _prevRankMap[a.sales] = i + 1;
  });
  const myAreaNames = myMainAreas.map(a => a.area);

  // Group Lani rows together — sort so both Lani rows are adjacent
  // (they already come from same sales name, just different areas)

  let lbHtml = '';
  let rank = 0;
  const renderedSales = new Set(); // track who we've already ranked

  sortedAreas.forEach((a, i) => {
    const isMe = myAreaNames.includes(a.area);
    const isLani = a.sales === 'Lani';

    // If Lani and we already rendered one Lani row, skip rank increment
    if (!renderedSales.has(a.sales)) {
      rank++;
      renderedSales.add(a.sales);
    }

    const rankDisp = rank <= 3 ? (rank===1?'🥇':rank===2?'🥈':'🥉') : rank;
    const meStyle = isMe ? 'background:var(--red-l);border-radius:8px;padding:8px 6px;margin:-2px -4px;' : '';
    const rowBadges = getBadgeIcons(a.sales, d);
    const _pr = _prevRankMap[a.sales];
    const _rd = _pr ? _pr - rank : null;
    const _rankChg = _rd > 0 ? `<span style="color:var(--green);font-size:.6rem;font-weight:700">↑${_rd}</span>`
      : _rd < 0 ? `<span style="color:var(--red);font-size:.6rem;font-weight:700">↓${Math.abs(_rd)}</span>` : '';
    lbHtml += `<div class="ac-row" style="${meStyle}">
      <div class="ac-rank" style="${rank<=3?'color:var(--gold);font-weight:700':''}">${rankDisp}${_rankChg}</div>
      <div style="flex:1;min-width:0">
        <div class="ac-name">${a.sales}${isMe?' 👈':''}${rowBadges ? ' <span class="ac-badges">'+rowBadges+'</span>' : ''}</div>
        <div class="ac-area">${a.area}</div>
      </div>
      <div class="ac-bar-wrap"><div class="ac-bar" style="width:${Math.min(a.pct,100)}%;background:${pctColor(a.pct)}"></div></div>
      <div class="ac-pct" style="color:${pctColor(a.pct)}">${a.pct}%</div>
    </div>`;

    // After each sales row, inject their Naughty Nuris sub-row if they have one
    const nnRow = nnAreas.find(n => n.sales === a.sales);
    if (nnRow) {
      const isNNMe = myNNArea && myNNArea.area === nnRow.area;
      const nnStyle = isNNMe ? 'background:var(--red-l);border-radius:8px;padding:8px 6px;margin:-2px -4px;' : '';
      lbHtml += `<div class="ac-row nn-subrow" style="${nnStyle}">
        <div class="ac-rank" style="color:var(--txt3);font-size:.65rem">↳</div>
        <div>
          <div class="ac-name" style="font-size:.75rem;color:var(--txt2)">${nnRow.area}</div>
          <div class="ac-area">Naughty Nuris</div>
        </div>
        <div class="ac-bar-wrap"><div class="ac-bar" style="width:${Math.min(nnRow.pct,100)}%;background:${pctColor(nnRow.pct)}"></div></div>
        <div class="ac-pct" style="color:${pctColor(nnRow.pct)};font-size:.75rem">${nnRow.pct}%</div>
      </div>`;
    }
  });

  // ── MY BADGES ──
  const myBadges = getBadges(repName, d);
  if (myBadges.length > 0) {
    bodyHtml += '<div class="badges-card">' +
      '<div class="gc-title">Your Badges This Month</div>' +
      '<div class="badges-grid">' +
      myBadges.map(b =>
        '<div class="badge-item">' +
          '<div class="badge-icon">' + b.icon + '</div>' +
          '<div class="badge-name">' + b.name + '</div>' +
          '<div class="badge-desc">' + b.desc + '</div>' +
        '</div>'
      ).join('') +
      '</div></div>';
  }

  bodyHtml += `<div class="area-card">
    <div class="ac-title">Area Leaderboard · ${RAW.month}</div>
    ${lbHtml}
  </div>`;

  // ── TODAY'S ORDERS ──
  bodyHtml += buildTodaySOHtml(getTodaySO(repName));
  const _fjLines = getFJData(repName);
  const _fjTodayLines = getFJData(repName, true);
  bodyHtml += buildTomorrowDeliveryHtml(_fjLines);
  bodyHtml += buildUnfulfilledHtml(_fjTodayLines);

  document.getElementById('target-body').innerHTML = bodyHtml;
}

// ── NESTLÉ REP TARGET VIEW ──
function renderNestleTarget(d, repName) {
  const myNestle = d.nestle_areas.find(n => n.sales === repName);
  if (!myNestle) { document.getElementById('target-hero').innerHTML = '<div style="padding:20px;color:white">No Nestlé data found</div>'; return; }

  const pct = myNestle.pct || 0;
  const ach = myNestle.achievement || 0;
  const tgt = myNestle.target || 0;
  const gap80  = Math.max(0, tgt * 0.80 - ach);
  const gap100 = Math.max(0, tgt - ach);
  const tagCls = pctTag(pct);
  const _tf2 = Math.floor(timeFactor());
  const tagLabel = pct >= 100 ? '🎉 Target Hit!' : pct >= _tf2 ? '🔥 On Pace' : pct >= _tf2 * 0.7 ? '📈 Getting There' : '⚡ Push Harder';

  const _dataAge2 = Math.round((new Date() - new Date(RAW.latest + 'T00:00:00')) / 86400000);
  const _freshColor2 = _dataAge2 === 0 ? 'var(--green)' : _dataAge2 === 1 ? 'var(--gold)' : 'var(--red)';
  const _freshLabel2 = _dataAge2 === 0 ? '● Live' : _dataAge2 === 1 ? '● 1d ago' : `● ${_dataAge2}d ago`;

  document.getElementById('target-hero').innerHTML = `
    <div class="th-month">${RAW.month} · <span style="color:${_freshColor2};font-size:.65rem">${_freshLabel2}</span></div>
    <div class="th-rep">${repName}</div>
    <div class="th-overall">
      <div>
        <div class="th-pct" style="color:${pctColor(pct)}">${pct}%</div>
        <div class="th-pct-label">Nestlé Target</div>
      </div>
      <div>
        <div class="th-status-tag ${tagCls}">${tagLabel}</div>
        <div style="color:rgba(255,255,255,0.35);font-size:.68rem;margin-top:6px">${fmtShort(ach)} of ${fmtShort(tgt)}</div>
      </div>
    </div>
    <div class="th-mini-grid">
      <div class="th-mini">
        <div class="th-mini-label">Achievement</div>
        <div class="th-mini-val">${fmtShort(ach)}</div>
        <div class="th-mini-pct" style="color:${pctColor(pct)}">${pct}%</div>
      </div>
      <div class="th-mini">
        <div class="th-mini-label">Target</div>
        <div class="th-mini-val">${fmtShort(tgt)}</div>
        <div class="th-mini-pct" style="color:rgba(255,255,255,0.4)">100%</div>
      </div>
    </div>`;

  let bodyHtml = '';

  // Progress bar
  bodyHtml += `<div class="milestone-card">
    <div class="mc-title">Nestlé Progress</div>
    <div class="mc-bars">
      <div class="mc-bar-row">
        <div class="mc-bar-top">
          <div class="mc-bar-label">Nestlé</div>
          <div class="mc-bar-nums">${fmtShort(ach)} / ${fmtShort(tgt)}</div>
        </div>
        <div class="mc-bar-bg">
          <div class="mc-bar-fill" style="width:${Math.min(pct,100)}%;background:#B07D1A"></div>
        </div>
        <div class="mc-markers">
          <div class="mc-mark" style="left:80%"><div class="mc-mark-line"></div><div class="mc-mark-label">80%</div></div>
          <div class="mc-mark" style="left:99%"><div class="mc-mark-line"></div><div class="mc-mark-label">100%</div></div>
        </div>
      </div>
    </div>
  </div>`;

  // Gap card
  bodyHtml += `<div class="gap-card">
    <div class="gc-title">How Much More to Go</div>
    <div class="gc-grid">
      <div class="gc-item">
        <div class="gc-label">To reach 80%</div>
        <div class="gc-val" style="color:${gap80===0?'var(--green)':'var(--gold)'}">${gap80===0?'✓ Done':fmtShort(gap80)}</div>
        <div class="gc-sub">${gap80===0?'Milestone reached!':'Still needed'}</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">Daily rate to 80%</div>
        <div class="gc-val" style="color:var(--gold)">${gap80===0?'✓ Done':(daysLeft()>0?fmtShort(gap80/daysLeft()):'—')}</div>
        <div class="gc-sub">per day needed</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">To reach 100%</div>
        <div class="gc-val" style="color:${gap100===0?'var(--green)':'var(--red)'}">${gap100===0?'✓ Done':fmtShort(gap100)}</div>
        <div class="gc-sub">${gap100===0?'Target achieved!':'Still needed'}</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">Daily rate to 100%</div>
        <div class="gc-val" style="color:var(--red)">${daysLeft()>0?fmtShort(gap100/daysLeft()):'—'}</div>
        <div class="gc-sub">per day needed</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">Days remaining</div>
        <div class="gc-val">~${daysLeft()}</div>
        <div class="gc-sub">in ${RAW.month}</div>
        ${_tf2 > 0 ? `<div class="gc-sub" style="color:${pctColor(Math.round(pct/_tf2*100))}">proj. ~${Math.round(pct/_tf2*100)}%</div>` : ''}
      </div>
    </div>
  </div>`;

  // Nestlé Leaderboard
  const sortedNestle = [...d.nestle_areas].sort((a,b) => b.pct - a.pct);
  bodyHtml += `<div class="area-card">
    <div class="ac-title">Nestlé Leaderboard · ${RAW.month}</div>
    ${sortedNestle.map((n,i) => {
      const isMe = n.sales === repName;
      const nb = getBadgeIcons(n.sales, d);
      return `<div class="ac-row" style="${isMe?'background:var(--red-l);border-radius:8px;padding:8px 6px;margin:-2px -4px;':''}">
        <div class="ac-rank" style="${i<3?'color:var(--gold);font-weight:700':''}">${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)}</div>
        <div style="flex:1;min-width:0">
          <div class="ac-name">${n.sales}${isMe?' 👈':''}${nb?' <span class="ac-badges">'+nb+'</span>':''}</div>
          <div class="ac-area">${n.area}</div>
        </div>
        <div class="ac-bar-wrap"><div class="ac-bar" style="width:${Math.min(n.pct,100)}%;background:${pctColor(n.pct)}"></div></div>
        <div class="ac-pct" style="color:${pctColor(n.pct)}">${n.pct}%</div>
      </div>`;
    }).join('')}
  </div>`;

  // Today's orders
  bodyHtml += buildTodaySOHtml(getTodaySO(repName));
  const _fjLines = getFJData(repName);
  const _fjTodayLines = getFJData(repName, true);
  bodyHtml += buildTomorrowDeliveryHtml(_fjLines);
  bodyHtml += buildUnfulfilledHtml(_fjTodayLines);

  document.getElementById('target-body').innerHTML = bodyHtml;
}

function daysLeft() {
  const dataDate = new Date(RAW.latest + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfMonth = new Date(dataDate.getFullYear(), dataDate.getMonth() + 1, 0);
  endOfMonth.setHours(0, 0, 0, 0);
  if (today > endOfMonth) return 0;
  // Count working days: Mon–Sat, excluding public holidays
  let count = 0;
  const d = new Date(today);
  d.setDate(d.getDate() + 1); // start from tomorrow
  while (d <= endOfMonth) {
    const dow = d.getDay();
    const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (dow !== 0 && !PUBLIC_HOLIDAYS.has(ds)) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, count);
}

// ════════════════
// PRICELIST
// ════════════════
function switchDiv(div, btn) {
  plDiv = div; plCat = 'ALL'; plSearch = '';
  document.getElementById('pl-search').value = '';
  document.querySelectorAll('.pl-divtab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCats(); renderList();
}

function renderPricelist() {
  const nestleOnly = currentRep && isNestleRep(currentRep.name);
  if (nestleOnly) {
    // Nestlé reps: force MKS, Nestlé category, hide category chips
    plDiv = 'MKS';
    plCat = 'Nestle';
    document.querySelectorAll('.pl-divtab').forEach(b => b.classList.remove('active'));
    const mksTab = document.querySelectorAll('.pl-divtab')[1];
    if (mksTab) mksTab.classList.add('active');
    // Hide category strip and MKU tab
    const cats = document.getElementById('pl-cats');
    if (cats) cats.style.display = 'none';
    const divTabs = document.getElementById('pl-divtabs');
    if (divTabs) divTabs.style.display = 'none';
    const mksN = PRODUCTS.filter(p => p.division === 'MKS' && p.category === 'Nestle').length;
    document.getElementById('mks-count').textContent = mksN;
  } else {
    // Restore visibility for non-Nestlé reps
    const cats = document.getElementById('pl-cats');
    if (cats) cats.style.display = '';
    const divTabs = document.getElementById('pl-divtabs');
    if (divTabs) divTabs.style.display = '';
    const mkuN = PRODUCTS.filter(p => p.division === 'MKU').length;
    const mksN = PRODUCTS.filter(p => p.division === 'MKS').length;
    document.getElementById('mku-count').textContent = mkuN;
    document.getElementById('mks-count').textContent = mksN;
  }
  renderCats(); renderList();
}

function getFiltered() {
  // Nestlé reps only see Nestlé products
  const nestleOnly = currentRep && isNestleRep(currentRep.name);

  return PRODUCTS.filter(p => {
    if (p.division !== plDiv) return false;
    if (nestleOnly && p.category !== 'Nestle') return false;
    if (plCat !== 'ALL' && p.category !== plCat) return false;
    if (plSearch) {
      const q = plSearch.toLowerCase();
      return p.name.toLowerCase().includes(q) ||
             p.brand.toLowerCase().includes(q) ||
             p.category.toLowerCase().includes(q) ||
             p.id.toLowerCase().includes(q);
    }
    return true;
  });
}

function sortedCats(div) {
  const order = div === 'MKU' ? CAT_ORDER_MKU : CAT_ORDER_MKS;
  const available = [...new Set(PRODUCTS.filter(p=>p.division===div).map(p=>p.category))];
  // Sort by pricelist order, unknown categories go to end
  return available.sort((a,b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function renderCats() {
  const cats = sortedCats(plDiv);
  let h = `<button class="pl-cat ${plCat==='ALL'?'active':''}" onclick="selectCat('ALL')">All</button>`;
  cats.forEach(c => {
    h += `<button class="pl-cat ${plCat===c?'active':''}" onclick="selectCat('${c}')">${catIcon(c,14)} ${c}</button>`;
  });
  document.getElementById('pl-cats').innerHTML = h;
}

function renderList() {
  const items = getFiltered();
  const el = document.getElementById('pl-list');
  if (!items.length) {
    el.innerHTML = `<div class="pl-no-results"><div class="e">🔍</div><p>No products found</p></div>`;
    return;
  }

  let h = '';
  if (!plSearch && plCat === 'ALL') {
    // Use pricelist order for categories
    const orderedCats = sortedCats(plDiv);
    const groups = {};
    items.forEach(p => { if (!groups[p.category]) groups[p.category] = []; groups[p.category].push(p); });
    orderedCats.forEach(cat => {
      if (!groups[cat]) return;
      h += `<div class="pl-section-lbl">${catIcon(cat,13)} ${cat}</div>`;
      groups[cat].forEach(p => h += plCardHtml(p));
    });
  } else {
    items.forEach(p => h += plCardHtml(p));
  }
  el.innerHTML = h;
}

function findStockForProduct(p) {
  const _sd = RAW?.stock_by_date?.[RAW.latest];
  // Use division-specific data — same source as the stock tab
  const divStock = p.division === 'MKU'
    ? (_sd?.MKU_full || _sd?.MKU || [])
    : (_sd?.MKS_full || _sd?.MKS || []);
  const _sm = STOCK_MAP[p.id] || null;
  if (_sm) {
    const byCode = divStock.find(x => x.code === _sm.code);
    // Validate: the product's first word (brand) must appear in the matched stock name
    // to guard against stale STOCK_MAP entries pointing to a different product
    if (byCode) {
      const firstWord = p.name.toLowerCase().split(' ')[0];
      if (byCode.name && byCode.name.toLowerCase().includes(firstWord)) return byCode;
    }
  }
  const pn = p.name.toLowerCase();
  return divStock.find(x => x.name && x.name.toLowerCase().includes(pn))
    || divStock.find(x => x.name && x.name.toLowerCase().includes(pn.slice(0, 30)))
    || divStock.find(x => x.name && x.name.toLowerCase().includes(pn.slice(0, 20)));
}

function plCardHtml(p) {
  const div = p.division.toLowerCase();
  return `<div class="pl-card" onclick="openProdModal('${p.id}')">
    <div class="pl-card-icon">${catIcon(p.category,20)}</div>
    <div class="pl-card-info">
      <div class="pl-card-name">${p.name}</div>
      <div class="pl-card-meta">
        <span class="pl-card-tag">${p.brand !== '-' ? p.brand : p.category}</span>
        <span class="pl-card-tag">${p.packaging}</span>
      </div>
    </div>
    <div class="pl-card-price">
      <div class="pl-card-price-val ${div}">${fmtShort(p.priceUnit)}</div>
      <div class="pl-card-price-unit">/${p.unit}</div>
    </div>
  </div>`;
}

function onSearch(v) {
  plSearch = v.trim();
  if (plSearch) plCat = 'ALL';
  renderCats(); renderList();
}

function selectCat(c) { plCat = c; renderCats(); renderList(); }

// ════════════════
// PRODUCT MODAL
// ════════════════
function openProdModal(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  activeProduct = p;
  const div = p.division.toLowerCase();

  document.getElementById('pm-badge').className = 'pm-badge ' + div;
  document.getElementById('pm-badge').textContent = p.division + ' · ' + p.category;
  document.getElementById('pm-name').textContent = p.name;

  // Details
  document.getElementById('pm-details').innerHTML = `
    <div class="pm-det"><div class="pm-det-label">Brand</div><div class="pm-det-val">${p.brand !== '-' ? p.brand : '—'}</div></div>
    <div class="pm-det"><div class="pm-det-label">Origin</div><div class="pm-det-val">${p.origin !== '-' ? p.origin : '—'}</div></div>
    <div class="pm-det full"><div class="pm-det-label">Packaging</div><div class="pm-det-val">${p.packaging}</div></div>
    <div class="pm-det"><div class="pm-det-label">Price / Unit</div><div class="pm-det-val" style="color:var(--red)">${p.priceUnit ? fmt(p.priceUnit) + ' / ' + p.unit : '—'}</div></div>
    <div class="pm-det"><div class="pm-det-label">Price / Case</div><div class="pm-det-val" style="color:var(--txt2)">${p.priceCase ? fmt(p.priceCase) : '—'}</div></div>
    <div class="pm-det"><div class="pm-det-label">Product ID</div><div class="pm-det-val" style="font-family:var(--mono);font-size:.72rem">${p.id}</div></div>`;

  document.getElementById('prod-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeProdModal(e) { if (e.target === document.getElementById('prod-overlay')) closeProdModalBtn(); }
function closeProdModalBtn() {
  document.getElementById('prod-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

async function shareCatalog(filename, title, event) {
  event.preventDefault();
  event.stopPropagation();
  try {
    const res = await fetch(filename);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
    } else if (navigator.share) {
      await navigator.share({ title, url: new URL(filename, window.location.href).href });
    }
  } catch (e) {
    if (e.name !== 'AbortError') alert('Share not supported on this device');
  }
}

function shareProductWA() {
  if (!activeProduct) return;
  const p = activeProduct;
  const lines = [
    '*' + p.name + '*',
    p.division + ' - ' + p.category,
    'Packaging: ' + p.packaging,
    '',
    'Price:',
    ...TIERS.map(t => '  ' + t.label + ': ' + fmt(tierPrice(p.priceUnit, TIERS.indexOf(t))) + '/' + p.unit),
    '',
    'Order: +62 822-3661-7866',
    'Email: order@ptmku.com',
  ];
  openWA(lines.join('\n'));
}

function openWA(message) {
  // Opens WhatsApp with message pre-filled — user picks contact from their list
  window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank');
}

function addToOrder() {
  if (!activeProduct) return;
  const id = activeProduct.id;
  orderItems[id] = (orderItems[id] || 0) + 1;
  closeProdModalBtn();
  updateOrderBadge();
  showToast(`Added: ${activeProduct.name.split(' ').slice(0,3).join(' ')} ✓`);
}

function updateOrderBadge() {
  const total = Object.values(orderItems).reduce((a,b)=>a+b,0);
  const badge = document.getElementById('order-badge');
  badge.textContent = total;
  badge.style.display = total > 0 ? 'flex' : 'none';
}

// ════════════════
// ORDER BUILDER
// ════════════════
function renderOrder() {
  const ids = Object.keys(orderItems);
  const body = document.getElementById('order-body');

  if (!ids.length) {
    body.innerHTML = `<div class="order-empty">
      <div class="oe-ico">🛒</div>
      <p>No items yet</p>
      <small>Go to Pricelist → tap a product → Add to Order</small>
    </div>`;
    return;
  }

  let total = 0;
  let itemsH = '';
  ids.forEach(id => {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    const qty = orderItems[id];
    const tierIdx = qty >= 11 ? 2 : qty >= 6 ? 1 : 0;
    const price = tierPrice(p.priceUnit, tierIdx);
    const lineTotal = price * qty;
    total += lineTotal;
    itemsH += `<div class="oi-card">
      <div class="oi-info">
        <div class="oi-name">${p.name}</div>
        <div class="oi-tier">${TIERS[tierIdx].label} · ${fmt(price)}/${p.unit}</div>
      </div>
      <div class="oi-qty">
        <button class="oi-qty-btn minus" onclick="changeQty('${id}',-1)">−</button>
        <div class="oi-qty-val">${qty}</div>
        <button class="oi-qty-btn" onclick="changeQty('${id}',1)">+</button>
      </div>
      <div class="oi-price">
        <div class="oi-price-total">${fmtShort(lineTotal)}</div>
        <div class="oi-price-unit">×${qty}</div>
      </div>
    </div>`;
  });

  const itemCount = Object.values(orderItems).reduce((a,b)=>a+b,0);
  body.innerHTML = `
    <div class="order-items">${itemsH}</div>
    <div class="order-summary">
      <div class="os-row"><span class="os-label">${ids.length} product(s) · ${itemCount} units</span><span class="os-val"></span></div>
      <div class="os-row total"><span>Total Estimate</span><span>${fmt(total)}</span></div>
    </div>
    <div class="order-footer">
      <button class="of-send" onclick="sendOrder()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Send via WhatsApp
      </button>
      <button class="of-clear" onclick="clearOrder()" title="Clear all">🗑️</button>
    </div>`;
}

function changeQty(id, delta) {
  orderItems[id] = (orderItems[id] || 0) + delta;
  if (orderItems[id] <= 0) delete orderItems[id];
  updateOrderBadge();
  renderOrder();
}

function clearOrder() {
  orderItems = {};
  updateOrderBadge();
  renderOrder();
}

function sendOrder() {
  const ids = Object.keys(orderItems);
  if (!ids.length) return;
  const cust = document.getElementById('order-cust')?.value || '—';
  const notes = document.getElementById('order-notes')?.value || '';
  const rep = currentRep ? currentRep.name : '—';
  let total = 0;
  const lines = [
    `ORDER REQUEST`,
    `Sales: ${rep}`,
    `Customer: ${cust}`,
    notes ? `Notes: ${notes}` : '',
    `Date: ${RAW.latest}`,
    ``,
    `ITEMS:`,
  ].filter(Boolean);
  ids.forEach(id => {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    const qty = orderItems[id];
    const tierIdx = qty >= 11 ? 2 : qty >= 6 ? 1 : 0;
    const price = tierPrice(p.priceUnit, tierIdx);
    const lineTotal = price * qty;
    total += lineTotal;
    lines.push(`- ${p.name}: ${qty} ${p.unit} x ${fmt(price)} = ${fmt(lineTotal)}`);
  });
  lines.push(``, `*TOTAL: ${fmt(total)}*`);
  openWA(lines.join('\n'));
}

// ════════════════
// STOCK SCREEN
// ════════════════
function switchStockDiv(div, btn) {
  stockDiv = div;
  stockSearch = '';
  const inp = document.getElementById('stock-search-inp');
  if (inp) inp.value = '';
  document.querySelectorAll('.sdiv').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderStock();
}

function filterStock(f, btn) {
  stockFilter = f;
  document.querySelectorAll('.sf').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderStock();
}

function onStockSearch(v) {
  stockSearch = v.trim().toLowerCase();
  renderStock();
}

function renderStock() {
  let items = getStockData(stockDiv);

  // Apply search
  if (stockSearch) {
    items = items.filter(s => s.name && s.name.toLowerCase().includes(stockSearch));
  }

  // Apply status filter
  if (stockFilter !== 'all') items = items.filter(s => s.st === stockFilter);

  // Sort: critical first, then low, ok, out last
  const priority = { critical:0, low:1, ok:2, out:3 };
  items = [...items].sort((a,b) => (priority[a.st]||9) - (priority[b.st]||9));

  if (!items.length) {
    document.getElementById('stock-list').innerHTML = `<div class="pl-no-results"><div class="e">📦</div><p>No items found</p></div>`;
    return;
  }

  // Count all items (unfiltered) and stamp counts onto filter buttons
  const allItems = getStockData(stockDiv);
  const counts = { ok:0, low:0, critical:0, out:0 };
  allItems.forEach(s => { if (counts[s.st] !== undefined) counts[s.st]++; });
  const btnLabels = { ok:'In Stock', low:'Low', critical:'Critical', out:'Out' };
  Object.keys(btnLabels).forEach(k => {
    const btn = document.querySelector(`.sf.${k}`);
    if (btn) btn.innerHTML = `<span class="sf-dot ${k}"></span>${btnLabels[k]} ${counts[k]}`;
  });

  const statusLabel = { ok:'In Stock', low:'Low Stock', critical:'Critical', out:'Out of Stock' };
  let h = '';
  items.forEach(s => {
    const bufDays = s.buf > 0 ? `~${Math.round(s.buf)} days remaining` : s.saldo > 0 ? 'No avg data' : '';
    h += `<div class="sk-card">
      <div class="sk-status-dot ${s.st}"></div>
      <div class="sk-info">
        <div class="sk-name">${s.name}</div>
        <div class="sk-code">${s.code} · ${statusLabel[s.st] || s.st}</div>
      </div>
      <div class="sk-right">
        <div class="sk-qty ${s.st}">${fmtNum(s.saldo)} ${s.unit}</div>
        <div class="sk-buf">${bufDays}</div>
      </div>
    </div>`;
  });
  document.getElementById('stock-list').innerHTML = h;
}

// ════════════════
// TOOLKIT
// ════════════════
let activeToolkitSection = 'catalogs';

function switchToolkit(section, btn) {
  activeToolkitSection = section;
  document.querySelectorAll('.tk-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.toolkit-section').forEach(s => s.classList.add('hidden'));
  if (btn) btn.classList.add('active');
  const sec = document.getElementById('tksec-' + section);
  if (sec) sec.classList.remove('hidden');

  // Show language toggle only on bilingual sections
  const langBar = document.getElementById('tk-lang-bar');
  if (langBar) {
    langBar.style.display = ['spotlight','faq','battle','modules'].includes(section) ? 'flex' : 'none';
    if (langBar.style.display === 'flex') _syncLangToggle(); // keep toggle in sync with _tkLang
  }

  if (section === 'spotlight') renderSpotlight();
  if (section === 'faq')       renderFAQ('');
  if (section === 'battle')    renderBattleCards();
  if (section === 'modules')   renderModules();
}

function renderSpotlight() {
  const el = document.getElementById('spotlight-list');
  if (!el || typeof TOOLKIT === 'undefined') return;

  const items = TOOLKIT.spotlight || [];
  if (!items.length) {
    el.innerHTML = '<div class="tk-empty">No spotlight items yet</div>';
    return;
  }

  el.innerHTML = items.map(item => {
    const focusBadge = item.focus
      ? '<span class="tk-focus-badge">This Months Focus</span>'
      : '';
    return `<div class="tk-card spotlight-card">
      ${focusBadge}
      <div class="tk-card-category">${T(item.category)}</div>
      <div class="tk-card-title">${item.product}</div>
      <div class="tk-card-tagline">${T(item.tagline)}</div>
      <div class="tk-section-lbl">The Pitch</div>
      <div class="tk-card-body">${T(item.pitch)}</div>
      <div class="tk-section-lbl">Target Customer</div>
      <div class="tk-card-body">${T(item.target)}</div>
      <div class="tk-tip-box">
        <div class="tk-tip-ico">💡</div>
        <div class="tk-tip-txt">${T(item.tip)}</div>
      </div>
      <button class="tk-share-btn" onclick="shareSpotlight(${item.id})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Share with Customer
      </button>
    </div>`;
  }).join('');
}

function shareSpotlight(id) {
  if (typeof TOOLKIT === 'undefined') return;
  const item = (TOOLKIT.spotlight || []).find(s => s.id === id);
  if (!item) return;
  const lines = [
    '*' + item.product + '*',
    T(item.tagline),
    '',
    T(item.pitch),
    '',
    'Target: ' + T(item.target),
    '',
    'Order: +62 822-3661-7866 | order@ptmku.com'
  ];
  window.open('https://wa.me/?text=' + encodeURIComponent(lines.join('\n')), '_blank');
}

function renderFAQ(query) {
  const el = document.getElementById('faq-list');
  if (!el || typeof TOOLKIT === 'undefined') return;

  let items = TOOLKIT.faq || [];
  if (query) {
    const q = query.toLowerCase();
    items = items.filter(f =>
      T(f.question).toLowerCase().includes(q) ||
      T(f.answer).toLowerCase().includes(q)
    );
  }

  if (!items.length) {
    el.innerHTML = '<div class="tk-empty">No results found</div>';
    return;
  }

  el.innerHTML = items.map(f => `
    <div class="tk-faq-card" onclick="this.classList.toggle('open')">
      <div class="tk-faq-q">
        <span>${T(f.question)}</span>
        <svg class="tk-faq-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="tk-faq-a" style="white-space:pre-line">${T(f.answer)}</div>
    </div>`).join('');
}


function _syncLangToggle() {
  const isId = _tkLang === 'id';
  document.getElementById('tk-lang-en')?.classList.toggle('active', !isId);
  document.getElementById('tk-lang-id')?.classList.toggle('active', isId);
  document.getElementById('tk-lang-track')?.classList.toggle('id-active', isId);
  const knob = document.getElementById('tk-lang-knob');
  if (knob) knob.textContent = isId ? '🇮🇩' : '🇬🇧';
}

function toggleTkLang() {
  _tkLang = _tkLang === 'en' ? 'id' : 'en';
  _syncLangToggle();
  if (activeToolkitSection === 'spotlight') renderSpotlight();
  if (activeToolkitSection === 'faq')       renderFAQ('');
  if (activeToolkitSection === 'battle')    renderBattleCards();
  if (activeToolkitSection === 'modules')   renderModules();
}

function renderBattleCards() {
  const el = document.getElementById('battle-list');
  if (!el || typeof TOOLKIT === 'undefined') return;

  const items = TOOLKIT.battlecards || [];
  if (!items.length) {
    el.innerHTML = '<div class="tk-empty">No battle cards yet</div>';
    return;
  }

  el.innerHTML = items.map(b => `
    <div class="tk-card battle-card">
      <div class="tk-battle-situation">
        <span class="tk-battle-label">Situation</span>
        ${T(b.situation)}
      </div>
      <div class="tk-section-lbl">Your Response</div>
      <div class="tk-card-body">${T(b.response)}</div>
      <div class="tk-section-lbl">Key Points</div>
      <ul class="tk-battle-points">
        ${TArr(b.keypoints).map(p => '<li>' + p + '</li>').join('')}
      </ul>
    </div>`).join('');
}

function renderModules() {
  const el = document.getElementById('modules-list');
  if (!el || typeof TOOLKIT === 'undefined') return;
  const items = TOOLKIT.modules || [];
  if (!items.length) { el.innerHTML = '<div class="tk-empty">No modules yet</div>'; return; }
  el.innerHTML = items.map(m => {
    const divLabel = m.division ? `<span class="pl-card-tag" style="background:${m.color}20;color:${m.color}">${m.division}</span>` : '';
    const sectionsHtml = (m.sections || []).map(s => `
      <div class="tk-mod-section">
        <div class="tk-section-lbl">${T(s.heading)}</div>
        <div class="tk-card-body" style="white-space:pre-line">${T(s.content)}</div>
      </div>`).join('');
    const chev = `<svg class="tk-mod-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>`;
    return `<div class="tk-card module-card" style="border-top:3px solid ${m.color||'var(--red)'}" onclick="this.classList.toggle('open')">
      <div class="tk-mod-hdr">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:1.4rem">${m.icon||'📖'}</span>
          <div>
            <div class="tk-card-title" style="margin:0">${T(m.title)}</div>
            <div style="margin-top:2px">${divLabel}</div>
          </div>
        </div>
        ${chev}
      </div>
      <div class="tk-mod-body">${sectionsHtml}</div>
    </div>`;
  }).join('');
}

// ════════════════
// ANNOUNCEMENTS
// ════════════════
const ANN_KEY = 'mku_ann_read';

function getReadIds() {
  try { return JSON.parse(localStorage.getItem(ANN_KEY) || '[]'); } catch { return []; }
}

function markAllRead() {
  if (typeof ANNOUNCEMENTS === 'undefined') return;
  const ids = ANNOUNCEMENTS.map(a => a.id);
  localStorage.setItem(ANN_KEY, JSON.stringify(ids));
  updateBellBadge();
}

function updateBellBadge() {
  if (typeof ANNOUNCEMENTS === 'undefined') return;
  const read = getReadIds();
  const unread = ANNOUNCEMENTS.filter(a => !read.includes(a.id)).length;
  const badge = document.getElementById('bell-badge');
  if (!badge) return;
  badge.textContent = unread;
  badge.classList.toggle('hidden', unread === 0);
}

function toggleAnnouncements() {
  const overlay = document.getElementById('ann-overlay');
  if (!overlay) return;
  if (overlay.classList.contains('hidden')) {
    renderAnnouncements();
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    markAllRead();
  } else {
    closeAnnouncements();
  }
}

function closeAnnouncements(e) {
  if (e && e.target !== document.getElementById('ann-overlay')) return;
  const overlay = document.getElementById('ann-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

function renderAnnouncements() {
  const list = document.getElementById('ann-list');
  if (!list) return;
  if (typeof ANNOUNCEMENTS === 'undefined' || !ANNOUNCEMENTS.length) {
    list.innerHTML = '<div class="ann-empty">No announcements yet</div>';
    return;
  }

  const CAT_COLORS = {
    'Urgent':  { bg:'#FEE2E2', border:'#C8242A', text:'#C8242A' },
    'Promo':   { bg:'#FDF5E4', border:'#B07D1A', text:'#B07D1A' },
    'Product': { bg:'#EDF2FB', border:'#163C70', text:'#163C70' },
    'General': { bg:'#F4F4F6', border:'#AEAEB8', text:'#54545E' },
  };

  list.innerHTML = ANNOUNCEMENTS.map(a => {
    const c = CAT_COLORS[a.category] || CAT_COLORS['General'];
    const d = new Date(a.date).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'2-digit' });
    return `<div class="ann-card" style="border-left:3px solid ${c.border}">
      <div class="ann-card-top">
        <span class="ann-cat" style="background:${c.bg};color:${c.text}">${a.category}</span>
        <span class="ann-date">${d} · ${a.author}</span>
      </div>
      <div class="ann-title">${a.title}</div>
      <div class="ann-msg">${a.message}</div>
    </div>`;
  }).join('');
}

// ── INIT ──
// buildLogin() is called by index.html after data loads and login HTML is ready
// Do NOT call it here — rep-select does not exist yet at this point

// ════════════════════════════════════════════════════════════
// CUSTOMERS TAB
// Reads CUSTOMERS.by_rep[repName].customers[custCode]
// ════════════════════════════════════════════════════════════

let _custGroup = 'all';
let _custQuery = '';
let _custModalRep = null;
let _custModalKey = null;
let _custModalMonth = null;
let _custShowAll = false;

const MONTH_ORDER_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const MONTH_SHORT = {
  'January':'Jan','February':'Feb','March':'Mar','April':'Apr',
  'May':'May','June':'Jun','July':'Jul','August':'Aug',
  'September':'Sep','October':'Oct','November':'Nov','December':'Dec'
};
const GROUP_ICONS = {
  'RESTAURANT':'🍽️','HOTEL':'🏨','BEACH CLUB':'🏖️',
  'WHOLE SALES':'📦','CATERING':'🍱','BAR':'🍸',
  'NIGHT CLUB':'🎵','SUPERMARKET':'🛒','RETAIL':'🏪',
  'LEISURE & EDUCATION':'🎓','INDUSTRY':'🏭','KARAOKE':'🎤','OTHERS':'📋'
};

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function monthIdx(m) {
  const i = MONTH_ORDER_NAMES.indexOf(m);
  return i >= 0 ? i : 99;
}

// ── Merge duplicate customer entries with the same name under the same rep ──
function mergeDuplicateCustomers(entries) {
  const seen = {};   // key: "rep|CUSTOMER NAME" → merged entry
  const order = [];  // preserve first-seen order
  for (const c of entries) {
    const key = (c.sales || '') + '|' + (c.name || '').trim().toUpperCase();
    if (!seen[key]) {
      seen[key] = { ...c, monthly: { ...(c.monthly || {}) }, products: [...(c.products || [])] };
      order.push(key);
    } else {
      const m = seen[key];
      // Merge monthly revenue
      for (const [month, rev] of Object.entries(c.monthly || {}))
        m.monthly[month] = (m.monthly[month] || 0) + rev;
      // Merge total YTD
      m.total = (m.total || 0) + (c.total || 0);
      // Merge products list
      m.products = m.products.concat(c.products || []);
      // Keep latest last_month
      if (c.last_month && monthIdx(c.last_month) > monthIdx(m.last_month || ''))
        m.last_month = c.last_month;
    }
  }
  return order.map(k => seen[k]);
}

// ── Get customer list for current rep ──
function getRepCustomerList() {
  if (typeof CUSTOMERS === 'undefined' || !CUSTOMERS.by_rep) return [];
  const rep = window._currentRep || '';
  let entries = [];
  if (!rep || rep === 'Management Bali') {
    for (const [repName, repData] of Object.entries(CUSTOMERS.by_rep)) {
      for (const [code, c] of Object.entries(repData.customers || {}))
        entries.push({code, ...c, sales: repName});
    }
  } else {
    const exactData = CUSTOMERS.by_rep[rep];
    if (exactData) {
      for (const [code, c] of Object.entries(exactData.customers || {}))
        entries.push({code, ...c, sales: rep});
    } else {
      // Fallback: collect all keys that start with rep name (e.g. "Sriasih (GT)" + "Sriasih (MT)")
      for (const [key, repData] of Object.entries(CUSTOMERS.by_rep)) {
        if (key.startsWith(rep + ' ') || key.startsWith(rep + '(')) {
          for (const [code, c] of Object.entries(repData.customers || {}))
            entries.push({code, ...c, sales: rep});
        }
      }
    }
  }
  return mergeDuplicateCustomers(entries);
}

// ── Compute growth % between last two active months ──
function getGrowth(monthly) {
  if (!monthly) return null;
  const months = Object.keys(monthly)
    .filter(m => (monthly[m]||0) > 0)
    .sort((a,b) => monthIdx(a) - monthIdx(b));
  if (months.length < 2) return null;
  const last = monthly[months[months.length-1]];
  const prev = monthly[months[months.length-2]];
  if (!prev) return null;
  return Math.round(((last - prev) / prev) * 100);
}

// ── Mini spark line SVG ──
function buildSparkline(monthly, months) {
  // Only plot months with actual revenue — avoids false drops when current month has no data yet
  const activeMonths = months.filter(m => (monthly[m] || 0) > 0);
  if (activeMonths.length < 2) return '';
  const vals = activeMonths.map(m => monthly[m]);
  const max = Math.max(...vals, 1);
  const W = 64, H = 24, pad = 2;
  const n = vals.length;
  const pts = vals.map((v, i) => {
    const x = pad + (i / (n-1)) * (W - pad*2);
    const y = H - pad - ((v / max) * (H - pad*2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastV = vals[n-1];
  const prevV = vals[n-2];
  const color = lastV >= prevV ? '#22c55e' : '#ef4444';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
    <polyline points="${pts}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${(pad + ((n-1)/(n-1))*(W-pad*2)).toFixed(1)}" cy="${(H - pad - ((lastV/max)*(H-pad*2))).toFixed(1)}" r="2.5" fill="${color}"/>
  </svg>`;
}

// ── INIT ──
function initCustomers() {
  window._custTabOpen = true;
  // Reset filters so list always reflects current rep on tab open
  _custGroup = 'all';
  _custQuery = '';
  const searchEl = document.getElementById('cust-search-inp');
  if (searchEl) searchEl.value = '';
  const sortEl = document.getElementById('cust-sort');
  if (sortEl) sortEl.value = 'revenue';
  document.querySelectorAll('.cf').forEach(b => b.classList.remove('active'));
  const allBtn = document.querySelector('.cf');
  if (allBtn) allBtn.classList.add('active');

  const el = document.getElementById('cust-list');
  if (!el) return;
  if (!window._customersReady || typeof CUSTOMERS === 'undefined') {
    el.innerHTML = `<div class="cust-loading">
      <div class="cust-loading-spinner"></div>
      <div class="cust-loading-txt">Loading customer data…<br>
      <span style="font-size:.7rem;opacity:.6">Updates daily from GitHub</span></div>
    </div>`;
    return;
  }
  // Wait for next paint so screen is visible before rendering
  requestAnimationFrame(() => requestAnimationFrame(renderCustomers));
}

function onCustSearch(val) { _custQuery = val.trim().toLowerCase(); renderCustomers(); }

function filterCustGroup(group, btn) {
  _custGroup = group;
  document.querySelectorAll('.cf').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCustomers();
}

function renderCustomers() {
  const el = document.getElementById('cust-list');
  if (!el || typeof CUSTOMERS === 'undefined') return;

  let custs = getRepCustomerList();

  const curMonthName = (RAW.month || '').split(' ')[0];
  if (_custGroup === 'INACTIVE') {
    custs = custs.filter(c => {
      const mAgo = c.last_month ? monthIdx(curMonthName) - monthIdx(c.last_month) : 99;
      return mAgo >= 2;
    });
  } else if (_custGroup !== 'all') {
    custs = custs.filter(c => (c.group||'').toUpperCase() === _custGroup.toUpperCase());
  }

  if (_custQuery)
    custs = custs.filter(c =>
      (c.name||'').toLowerCase().includes(_custQuery) ||
      (c.area||'').toLowerCase().includes(_custQuery)
    );

  const sortBy = document.getElementById('cust-sort')?.value || 'revenue';
  if (sortBy === 'revenue') custs.sort((a,b) => (b.total||0)-(a.total||0));
  else if (sortBy === 'recent') custs.sort((a,b) => monthIdx(b.last_month)-monthIdx(a.last_month));
  else if (sortBy === 'inactive') {
    custs.sort((a,b) => {
      const ai = a.last_month ? monthIdx(a.last_month) : -1;
      const bi = b.last_month ? monthIdx(b.last_month) : -1;
      return ai - bi; // oldest last_month first = most inactive at top
    });
  } else custs.sort((a,b) => (a.name||'').localeCompare(b.name||''));

  const countEl = document.getElementById('cust-count');
  if (countEl) countEl.textContent = custs.length + ' customers';

  if (!custs.length) {
    el.innerHTML = '<div class="cust-empty">No customers found</div>';
    return;
  }

  const months = CUSTOMERS.months || [];

  el.innerHTML = custs.map(c => {
    const icon = GROUP_ICONS[(c.group||'').toUpperCase()] || '📋';
    const rev = c.total ? 'Rp '+(c.total/1000000).toFixed(1)+'M' : '—';
    const lastMon = MONTH_SHORT[c.last_month] || c.last_month || '—';
    const growth = getGrowth(c.monthly);
    const sparkHtml = months.length >= 2 ? buildSparkline(c.monthly, months) : '';
    const growthHtml = growth !== null
      ? `<span class="cust-growth ${growth>=0?'pos':'neg'}">${growth>=0?'↑':'↓'}${Math.abs(growth)}%</span>`
      : '';
    // Inactive alert — months since last order
    const curMonthName = (RAW.month || '').split(' ')[0];
    const mAgo = c.last_month ? monthIdx(curMonthName) - monthIdx(c.last_month) : 99;
    const lastStyle = mAgo >= 2 ? 'color:var(--red);font-weight:600' : mAgo === 1 ? 'color:var(--gold)' : '';
    const inactiveTag = mAgo >= 2 ? ` <span style="font-size:.6rem;background:var(--red-l);color:var(--red);padding:1px 5px;border-radius:4px;font-weight:700"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg> ${mAgo}mo</span>` : '';

    return `<div class="cust-card" onclick="openCustModal('${escHtml(c.sales)}','${escHtml(c.code)}')">
      <div class="cust-card-top">
        <div class="cust-card-icon">${icon}</div>
        <div class="cust-card-info">
          <div class="cust-card-name">${escHtml(c.name)}</div>
          <div class="cust-card-sub">${escHtml(c.area||'')} · ${escHtml(c.group||'')}</div>
        </div>
        <div class="cust-card-rev">${rev}</div>
      </div>
      <div class="cust-card-bottom">
        <div class="cust-spark-wrap">${sparkHtml}${growthHtml}</div>
        <div class="cust-last-order" style="${lastStyle}">Last: ${lastMon}${inactiveTag}</div>
      </div>
    </div>`;
  }).join('');
}

// ── MODAL ──
function openCustModal(repName, custCode) {
  if (typeof CUSTOMERS === 'undefined') return;
  const c = (CUSTOMERS.by_rep[repName]||{}).customers?.[custCode];
  if (!c) return;
  _custModalRep = repName; _custModalKey = custCode;
  _custModalMonth = null; _custShowAll = false;

  const months = CUSTOMERS.months || [];
  const activeMonths = months.filter(m => (c.monthly||{})[m] > 0);
  const growth = getGrowth(c.monthly);

  // Header
  document.getElementById('cm-name').textContent = c.name;
  document.getElementById('cm-meta').textContent =
    (c.area||'') + ' · ' + (c.group||'') + ' · ' + repName;

  // Spark + growth banner
  const sparkSvg = months.length >= 2 ? buildSparkline(c.monthly, months) : '';
  const growthStr = growth !== null
    ? `<span class="cm-growth-badge ${growth>=0?'pos':'neg'}">${growth>=0?'↑':'↓'}${Math.abs(growth)}% vs last month</span>`
    : '';
  document.getElementById('cm-spark-row').innerHTML =
    `<div class="cm-spark-inner">${sparkSvg}<div class="cm-spark-months">${
      months.map(m=>`<span class="cm-spark-lbl ${(c.monthly||{})[m]>0?'':'cm-spark-lbl-dim'}">${MONTH_SHORT[m]||m}</span>`).join('')
    }</div></div>${growthStr}`;

  // Stats row
  const rev = c.total ? 'Rp '+(c.total/1000000).toFixed(1)+'M' : '—';
  const topCat = _getTopCategory(c.products||[]);
  document.getElementById('cm-stats').innerHTML = `
    <div class="cm-stat"><div class="cm-stat-val">${rev}</div><div class="cm-stat-lbl">Total YTD</div></div>
    <div class="cm-stat"><div class="cm-stat-val">${activeMonths.length}</div><div class="cm-stat-lbl">Active Months</div></div>
    <div class="cm-stat"><div class="cm-stat-val" style="font-size:.72rem">${escHtml(topCat)}</div><div class="cm-stat-lbl">Top Category</div></div>
  `;

  // Monthly revenue chips
  document.getElementById('cm-monthly-rev').innerHTML =
    activeMonths.map(m => {
      const v = c.monthly[m]||0;
      const vStr = v>=1000000?'Rp '+(v/1000000).toFixed(1)+'M':'Rp '+(v/1000).toFixed(0)+'K';
      return `<div class="cm-mon-chip" onclick="setCustMonth('${m}')">
        <div class="cm-mon-name">${MONTH_SHORT[m]||m}</div>
        <div class="cm-mon-val">${vStr}</div>
      </div>`;
    }).join('');

  // Top 5 products
  _renderTop5(c.products||[]);

  // Month tabs for history
  _buildMonthTabs(activeMonths);

  // Product history
  _renderHistory(c, null);

  document.getElementById('cust-overlay').classList.remove('hidden');
  document.getElementById('cust-modal').scrollTop = 0;
}

function _getTopCategory(products) {
  if (!products.length) return '—';
  const cats = {};
  products.forEach(p => {
    const cat = p.category || 'Other';
    cats[cat] = (cats[cat]||0) + p.value;
  });
  return Object.entries(cats).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
}

function _renderTop5(products) {
  const el = document.getElementById('cm-top5');
  if (!el) return;
  // Aggregate all months
  const byProd = {};
  products.forEach(p => {
    if (!byProd[p.code]) byProd[p.code] = {name:p.name, qty:0, value:0};
    byProd[p.code].qty += p.qty;
    byProd[p.code].value += p.value;
  });
  const top5 = Object.values(byProd).sort((a,b)=>b.value-a.value).slice(0,5);
  if (!top5.length) { el.innerHTML = '<div class="cm-no-orders">No products yet</div>'; return; }
  el.innerHTML = top5.map((p,i) => `
    <div class="cm-top5-row">
      <span class="cm-top5-rank">${i+1}</span>
      <span class="cm-top5-name">${escHtml(p.name)}</span>
      <span class="cm-top5-rev">${p.value>=1000000?'Rp '+(p.value/1000000).toFixed(1)+'M':'Rp '+(p.value/1000).toFixed(0)+'K'}</span>
    </div>`).join('');
}

function _buildMonthTabs(activeMonths) {
  const monthsDesc = [...activeMonths].reverse();
  document.getElementById('cm-month-tabs').innerHTML =
    ['all',...monthsDesc].map(m => {
      const label = m==='all'?'All':(MONTH_SHORT[m]||m);
      const isActive = (m==='all' && _custModalMonth===null) || m===_custModalMonth;
      return `<button class="cm-mtab${isActive?' active':''}" onclick="setCustMonth('${m}')">${label}</button>`;
    }).join('');
}

function setCustMonth(month) {
  _custModalMonth = (month==='all') ? null : month;
  _custShowAll = false;
  if (typeof CUSTOMERS === 'undefined' || !_custModalRep || !_custModalKey) return;
  const c = (CUSTOMERS.by_rep[_custModalRep]||{}).customers?.[_custModalKey];
  if (!c) return;
  const months = CUSTOMERS.months || [];
  const activeMonths = months.filter(m => (c.monthly||{})[m]>0);
  _buildMonthTabs(activeMonths);
  _renderHistory(c, _custModalMonth);
}

function _renderHistory(c, filterMonth) {
  const el = document.getElementById('cm-products');
  if (!el) return;
  const products = c.products || [];

  const aggregate = (prods) => {
    const byProd = {};
    prods.forEach(p => {
      if (!byProd[p.code]) byProd[p.code] = {name:p.name, qty:0, value:0};
      byProd[p.code].qty += p.qty;
      byProd[p.code].value += p.value;
    });
    return Object.values(byProd).sort((a,b)=>b.value-a.value);
  };

  if (filterMonth) {
    const rows = aggregate(products.filter(p=>p.month===filterMonth));
    if (!rows.length) { el.innerHTML='<div class="cm-no-orders">No orders in '+(MONTH_SHORT[filterMonth]||filterMonth)+'</div>'; return; }
    el.innerHTML = rows.map(p=>_productRow(p)).join('');
    return;
  }

  // All months — group by month newest first
  const months = CUSTOMERS.months || [];
  const activeMonths = [...months].filter(m=>(c.monthly||{})[m]>0).reverse();
  if (!activeMonths.length) { el.innerHTML='<div class="cm-no-orders">No order history</div>'; return; }

  // All items aggregated + show/hide toggle
  const allRows = aggregate(products);
  const PREVIEW = 10;
  const showAll = _custShowAll || allRows.length <= PREVIEW;
  const displayRows = showAll ? allRows : allRows.slice(0, PREVIEW);

  el.innerHTML = `
    <div class="cm-all-list">
      ${displayRows.map(p=>_productRow(p)).join('')}
    </div>
    ${!showAll ? `<button class="cm-show-all-btn" onclick="toggleCustShowAll()">Show all ${allRows.length} products ↓</button>` : ''}
  `;
}

function toggleCustShowAll() {
  _custShowAll = true;
  if (typeof CUSTOMERS === 'undefined' || !_custModalRep || !_custModalKey) return;
  const c = (CUSTOMERS.by_rep[_custModalRep]||{}).customers?.[_custModalKey];
  if (c) _renderHistory(c, _custModalMonth);
}

function _productRow(p) {
  const rev = p.value>=1000000?'Rp '+(p.value/1000000).toFixed(1)+'M':'Rp '+(p.value/1000).toFixed(0)+'K';
  const qty = p.qty%1===0?p.qty:p.qty.toFixed(1);
  return `<div class="cm-product-row">
    <div class="cm-product-name">${escHtml(p.name)}</div>
    <div class="cm-product-detail">
      <span class="cm-product-qty">${qty} pcs</span>
      <span class="cm-product-rev">${rev}</span>
    </div>
  </div>`;
}

function closeCustModal(e) {
  if (!e || e.target===document.getElementById('cust-overlay'))
    document.getElementById('cust-overlay').classList.add('hidden');
}
window.refreshCustIfOpen = function() {
  if (_custModalRep && _custModalKey) openCustModal(_custModalRep, _custModalKey);
};

function shareCustomerWA() {
  if (!_custModalRep || !_custModalKey || typeof CUSTOMERS==='undefined') return;
  const c = (CUSTOMERS.by_rep[_custModalRep]||{}).customers?.[_custModalKey];
  if (!c) return;
  const months = CUSTOMERS.months || [];
  const activeMonths = [...months].filter(m=>(c.monthly||{})[m]>0).reverse();
  const byProd={};
  (c.products||[]).forEach(p=>{
    if(!byProd[p.code]) byProd[p.code]={name:p.name,qty:0};
    byProd[p.code].qty+=p.qty;
  });
  const top5=Object.values(byProd).sort((a,b)=>b.qty-a.qty).slice(0,5);
  const growth=getGrowth(c.monthly);
  const growthStr=growth!==null?(growth>=0?`↑+${growth}%`:`↓${growth}%`):'';
  const lines=[
    `*Visit Summary — ${c.name}*`,
    `${c.area||''} · ${c.group||''}`,
    `Total YTD: Rp ${c.total?(c.total/1000000).toFixed(1)+'M':'—'} ${growthStr}`,
    `Last Order: ${c.last_month||'—'}`,
    '',
    '*Top Products (YTD):*',
    ...top5.map((p,i)=>`${i+1}. ${p.name} — ${p.qty%1===0?p.qty:p.qty.toFixed(1)} pcs`),
    '',
    '*Monthly Revenue:*',
    ...activeMonths.map(m=>{
      const v=c.monthly[m]||0;
      return `${m}: Rp ${v>=1000000?(v/1000000).toFixed(1)+'M':(v/1000).toFixed(0)+'K'}`;
    }),
    '','MKU & MKS Sales App'
  ];
  window.open('https://wa.me/?text='+encodeURIComponent(lines.join('\n')),'_blank');
}
