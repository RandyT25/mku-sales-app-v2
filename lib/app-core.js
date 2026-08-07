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
const COLORS = ['#AD1F28','#0F2E5C','#1A7A45','#B07D1A','#6B3FA0','#1A6B7A','#7A3A1A','#2A6BB0','#8B1A5A','#2A7A2A','#5A4A1A','#1A4A6B','#6B1A3A','#3A7A3A'];

// ── STOCK SEARCH STATE ──
let stockSearch = '';

// ── REP CONFIG (from real data) ──
const REP_CONFIG = [
  { name:'Picrom',         area:'UBUD',                   div:'MKS' },
  { name:'I Made Luih',   area:'DENPASAR - SANUR',        div:'MKS' },
  { name:'Juni',           area:'KUTA SEL - ULUWATU',     div:'MKS' },
  // The upstream achievement/customer spreadsheets never actually use "Lani" —
  // they've labeled this territory "VACANT" (Target sheet) / "Vacant Hotel Kuta
  // Seminyak" + "Vacant Hotel Seminyak Kuta" (customer history sheet) all year.
  // Only the daily SO/FJ delivery feed still says "Lani". These aliases let the
  // app recognize all of them as the same rep. ("FIB"/"EKA FIB" also appear in
  // that territory's rows but are a different, unrelated rep — deliberately
  // NOT aliased here.)
  { name:'Vacant',         area:'KUTA - INDUSTRI / HOTEL',div:'MKS', dbName:'Lani',
    aliases:['VACANT','Vacant Hotel Kuta Seminyak','Vacant Hotel Seminyak Kuta'] },
  { name:'Monica',         area:'KUTA SEL - NUSA DUA',    div:'MKS' },
  { name:'Sujana',         area:'SEMINYAK',                div:'MKS' },
  { name:'Eka',            area:'KUTA - LEGIAN',          div:'MKS' },
  { name:'Taufik',         area:'CANGGU 1',               div:'MKS' },
  { name:'Dewi Kristiani', area:'CANGGU 2',               div:'MKS' },
  { name:'Wira',           area:'GT + FOODY',             div:'MKS' },
  { name:'Sriasih',        area:'MODERN + GT',            div:'MKS' },
  { name:'Ridwan',         area:'NP-1 (Nestlé)',          div:'MKS' },
  { name:'Vacant',         area:'NP-2 (Nestlé)',          div:'MKS', dbName:'Redi' },
  { name:'Gek Mas',        area:'NP-3 (Nestlé)',          div:'MKS' },
  { name:'Manager',        area:'Management',              div:'MGMT' },
  { name:'Bisdev Food',      area:'Company-wide (Food)',      div:'MGMT' },
  { name:'Bisdev Beverage',  area:'Company-wide (Beverage)',  div:'MGMT' },
  { name:'Nestle Coordinator', area:'Nestle Team Overview',   div:'MGMT' },
  { name:'Super Admin',        area:'Super Admin',            div:'MGMT' },
];

// ── STATE ──
let currentRep   = null;
let currentTab   = 'today';
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

// Gap-card "to reach X%" cell. A target of 0 means no target has been set
// for this period (e.g. an unstaffed/vacant area) — distinct from a real
// gap of 0, which means the milestone was actually hit. Conflating the two
// used to show a misleading "✓ Done" for reps/areas with no data at all.
function gapCell(gap, target, doneLabel, pendingColor) {
  if (target <= 0) return { val: '—', sub: 'No target set', color: 'var(--txt3)' };
  if (gap === 0)    return { val: '✓ Done', sub: doneLabel, color: 'var(--green)' };
  return { val: fmtShort(gap), sub: 'Still needed', color: pendingColor };
}
// Gap-card "daily rate to X%" cell — same no-target distinction as gapCell().
function gapRate(gap, target) {
  if (target <= 0) return '—';
  if (gap === 0) return '✓ Done';
  return daysLeft() > 0 ? fmtShort(gap / daysLeft()) : '—';
}

// Some upstream feeds label a rep's territory under a different name than
// the app's canonical one (see REP_CONFIG[].aliases, e.g. "Lani" whose
// achievement/customer data is filed as "VACANT" / "Vacant Hotel ..."
// upstream) — treat any of those aliases as a match for that rep's rows.
function salesNameMatches(feedName, repName, aliases) {
  return feedName === repName || (!!aliases && aliases.includes(feedName));
}

// Time factor: % of month elapsed based on data date (e.g. day 3 of 30 = 10%)
function timeFactor() {
  if (typeof RAW === 'undefined') return 10;
  const d = new Date(RAW.latest + 'T00:00:00');
  return (d.getDate() / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) * 100;
}
// Color/tag based on pace: green = on/ahead of pace, gold = within 30% behind, red = lagging
const pctColor = p => { const tf = Math.floor(timeFactor()); return p >= tf ? 'var(--green)' : p >= tf * 0.7 ? 'var(--gold)' : 'var(--red)'; };
const pctTag   = p => { const tf = Math.floor(timeFactor()); return p >= tf ? 'good' : p >= tf * 0.7 ? 'warn' : 'low'; };
// Same thresholds as pctColor(), but the brighter --*-onDark variants — for
// text sitting directly on the dark hero gradient (.th-pct/.th-mini-pct),
// where pctColor()'s light-background-tuned colors are hard to read.
const pctColorOnDark = p => { const tf = Math.floor(timeFactor()); return p >= tf ? 'var(--green-onDark)' : p >= tf * 0.7 ? 'var(--gold-onDark)' : 'var(--red-onDark)'; };

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

// ── PACE STATUS ICONS (replaces emoji in the Target hero's status tag) ──
const PACE_ICON_PATHS = {
  hit:   '<path d="M20 6 9 17l-5-5"/>',
  pace:  '<path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c0-1-1-2-1-3 2 1 3 3 3 5a5 5 0 0 1-10 0c0-4 3-6 5-10z"/>',
  up:    '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  bolt:  '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
};
function paceIcon(key) {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;vertical-align:-2px;margin-right:3px">${PACE_ICON_PATHS[key]}</svg>`;
}

// ── MISC UI ICONS (replaces remaining emoji used as functional icons) ──
const UI_ICON_PATHS = {
  truck:      '<rect x="1" y="6" width="14" height="11" rx="1"/><path d="M15 10h4l3 3v4h-7z"/><circle cx="6" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  search:     '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>',
  box:        '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  cart:       '<circle cx="9" cy="21" r="1.5"/><circle cx="19" cy="21" r="1.5"/><path d="M2.5 3h2l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 8H6"/>',
  trash:      '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  bulb:       '<path d="M9 18h6M10 22h4"/><path d="M12 2a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 2z"/>',
  medal:      '<circle cx="12" cy="15" r="6"/><path d="M9 3 6 9l3 1M15 3l3 6-3 1"/>',
  target:     '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  trophy:     '<path d="M8 4h8v4a4 4 0 0 1-8 0V4z"/><path d="M8 5H5a2 2 0 0 0 0 4h1M16 5h3a2 2 0 0 1 0 4h-1"/><path d="M10 14v2a2 2 0 0 0 4 0v-2"/><path d="M8 21h8M12 17v4"/>',
  gem:        '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6-3 12M15 3l-3 6 3 12"/>',
  crown:      '<path d="M3 8l4 3 5-6 5 6 4-3-2 11H5z"/>',
  bento:      '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 12h18M9 6v6M15 6v6"/>',
  takeout:    '<path d="M4 8h16l-1 11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 8z"/><path d="M4 8l2-4h12l2 4"/><path d="M12 8v5"/>',
  butter:     '<rect x="4" y="9" width="16" height="9" rx="1.5"/><path d="M4 9l2-4h12l2 4"/>',
  bookmark:   '<path d="M6 3h12v18l-6-4-6 4V3z"/>',
  folder:     '<path d="M4 4h6l2 2h8v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
  download:   '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
};
function uiIcon(key, size) {
  size = size || 16;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;vertical-align:-3px">${UI_ICON_PATHS[key]}</svg>`;
}

// Toolkit module icons (data/toolkit.js `icon` field) can reference either
// the food/beverage category paths or the general UI icon set.
function modIcon(key, size) {
  size = size || 20;
  const path = CAT_ICON_PATHS[key] || UI_ICON_PATHS[key] || UI_ICON_PATHS.box;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${path}</svg>`;
}

// ── CUSTOMER GROUP ICONS (replaces GROUP_ICONS emoji map) ──
const GROUP_ICON_PATHS = {
  RESTAURANT: '<path d="M5 3v7a2 2 0 1 0 4 0V3M7 3v18M17 3c-2.5 0-3 3-3 5s1 4 3 4M17 3v18"/>',
  HOTEL:      '<path d="M3 18v-5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18v5"/><path d="M21 18v-3a2 2 0 0 0-2-2h-6"/><circle cx="7" cy="9" r="1.5"/><path d="M3 21v-3M21 21v-3"/>',
  'BEACH CLUB': '<path d="M12 12v10"/><path d="M12 2a10 10 0 0 1 10 10H2A10 10 0 0 1 12 2z"/><path d="M12 12L4 9M12 12l8-3"/>',
  'WHOLE SALES': UI_ICON_PATHS.box,
  CATERING:   UI_ICON_PATHS.bento,
  BAR:        '<path d="M7 3h10l-1 6a4 4 0 0 1-8 0L7 3z"/><path d="M12 13v6M8 21h8"/>',
  'NIGHT CLUB': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  SUPERMARKET: UI_ICON_PATHS.cart,
  RETAIL:     '<path d="M3 9l1-5h16l1 5"/><path d="M3 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/><path d="M4 9v10h16V9"/>',
  'LEISURE & EDUCATION': '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  INDUSTRY:   '<path d="M2 22V10l6 4v-4l6 4V4l8 6v12H2z"/>',
  KARAOKE:    '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  OTHERS:     UI_ICON_PATHS.box,
};
function groupIcon(group, size) {
  size = size || 20;
  const path = GROUP_ICON_PATHS[(group||'').toUpperCase()] || UI_ICON_PATHS.box;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${path}</svg>`;
}

// ── REP AVATARS (initials + per-rep color, from COLORS[]) ──
function repInitials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : (parts[0] || '?').slice(0, 2).toUpperCase();
}
function avatarHtml(name, color, size, photoUrl) {
  size = size || 32;
  if (photoUrl) {
    return `<div class="rep-avatar" style="width:${size}px;height:${size}px;background:${color};padding:0;overflow:hidden"><img src="${escHtml(photoUrl)}" style="width:100%;height:100%;object-fit:cover" alt=""></div>`;
  }
  return `<div class="rep-avatar" style="width:${size}px;height:${size}px;font-size:${size*0.38}px;background:${color}">${repInitials(name)}</div>`;
}
function repColorByName(name) {
  const idx = REP_CONFIG.findIndex(r => r.name === name);
  return idx !== -1 ? COLORS[idx % COLORS.length] : 'var(--txt3)';
}

function showToast(msg, ms) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.remove('show'), ms || 2200);
}

// In-app replacement for window.confirm() — see the CSS comment above
// #confirm-overlay for why: native confirm() is unreliable in installed
// PWAs on mobile and made destructive actions look like silent no-ops.
// Resolves true/false, same calling convention as `if (!confirm(...))`.
let _confirmResolve = null;
function confirmDialog(message, { danger = true, okLabel = 'OK' } = {}) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('confirm-msg').textContent = message;
    const okBtn = document.getElementById('confirm-btn-ok');
    okBtn.textContent = okLabel;
    okBtn.classList.toggle('danger', danger);
    document.getElementById('confirm-overlay').classList.remove('hidden');
  });
}
function _settleConfirm(result) {
  document.getElementById('confirm-overlay').classList.add('hidden');
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
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
function getTodaySO(repName, aliases) {
  // Exact match first (case/whitespace-insensitive via _norm), then fuzzy fallback for name variants
  const repNorm = _norm(repName);
  const exact = RAW.so.filter(s => s.date === RAW.latest && s.sales && _norm(s.sales) === repNorm);
  if (exact.length > 0) return exact;
  // Fallback 1: match on full name parts (not just first word)
  const parts = repName.toLowerCase().split(' ').filter(w => w.length > 2);
  const fuzzy = RAW.so.filter(s => s.date === RAW.latest && s.sales &&
    parts.every(p => s.sales.toLowerCase().includes(p)));
  if (fuzzy.length > 0) return fuzzy;
  // Fallback 2: explicit aliases (see REP_CONFIG[].aliases) — this feed
  // sometimes labels a territory under a name the prefix scan won't find.
  for (const alias of aliases || []) {
    const aliasNorm = _norm(alias);
    const aliasMatch = RAW.so.filter(s => s.date === RAW.latest && s.sales && _norm(s.sales) === aliasNorm);
    if (aliasMatch.length > 0) return aliasMatch;
  }
  return [];
}

function getFJData(repName, useTodayOnly, aliases) {
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
  const fuzzy = normalized.filter(r => r.nama_sales && parts.every(p => r.nama_sales.toLowerCase().includes(p)));
  if (fuzzy.length) return fuzzy;
  // Fallback: explicit aliases (see REP_CONFIG[].aliases) — mirrors
  // getRepCustomerList()'s alias fallback for territories the feed labels
  // under a completely different name.
  for (const alias of aliases || []) {
    const aliasMatch = normalized.filter(r => r.nama_sales === alias);
    if (aliasMatch.length) return aliasMatch;
  }
  return [];
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

// Whether the warehouse FJ file has been loaded at all (company-wide),
// independent of whether any of its rows happen to match a given rep —
// distinguishes "the file truly isn't uploaded yet" from "it's uploaded,
// this rep just has zero rows in it today".
function _fjHasAnyData() {
  return !!((typeof FJ_MKU !== 'undefined' && FJ_MKU.length) || (typeof FJ_MKS !== 'undefined' && FJ_MKS.length));
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
// normalize an SO number for cross-feed comparison (RAW.so vs FJ delivery
// data are two independently-produced feeds — whitespace/case differences
// in how each writes the same SO number must not break an "exact SO" match)
const _normSO = s => String(s || '').toLowerCase().replace(/\s+/g, '').trim();

const _CASE_UNITS = new Set(['KTN','SACK','BOX','CRT','CTN']);
const _unitClass = u => _CASE_UNITS.has((u || '').toUpperCase().trim()) ? 'case' : 'piece';

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

// Returns { value, tier } — tier tells the caller how trustworthy the
// number is: 'exact' (same SO, confirmed), 'hist-code'/'hist-name' (same
// product, but a different order — a reconstructed estimate), 'pricelist'
// (no order match at all, or the sanity cap below overrode a bad match),
// 'none' (nothing found).
function _fjLookupRevenue(no_so, kode_brg, nama_brg, qty_so, satuan) {
  if (!qty_so || !RAW?.so?.length) return { value: 0, tier: 'none' };
  const kb = (kode_brg || '').toLowerCase().trim();
  const su = (satuan || '').toUpperCase().trim();
  const plPrice = _plLookupPrice(nama_brg, satuan);
  // Sanity-cap: if historical unit price is >5× the pricelist price, use
  // pricelist instead — and flag it as capped so the tier reflects what
  // number is actually returned, not just which step matched.
  const _histRev = entry => {
    const unitPrice = entry.revenue / entry.so_pcs;
    if (plPrice && unitPrice > plPrice * 5) return { value: plPrice * qty_so, capped: true };
    return { value: unitPrice * qty_so, capped: false };
  };
  const _sameUnitClass = entry => !entry.unit || !su || _unitClass(entry.unit) === _unitClass(su);
  // 1. Exact SO + exact product code
  if (kb) {
    const exact = RAW.so.find(s => _normSO(s.no_so) === _normSO(no_so) && s.product && s.product.toLowerCase().trim() === kb && _sameUnitClass(s));
    if (exact && exact.so_pcs > 0) { const r = _histRev(exact); return { value: r.value, tier: r.capped ? 'pricelist' : 'exact' }; }
  }
  // 1b. Exact SO + product name match
  if (nama_brg) {
    const nb = nama_brg.toLowerCase().trim();
    const exactByName = RAW.so.find(s => _normSO(s.no_so) === _normSO(no_so) && s.product && s.product.toLowerCase().trim() === nb && _sameUnitClass(s));
    if (exactByName && exactByName.so_pcs > 0) { const r = _histRev(exactByName); return { value: r.value, tier: r.capped ? 'pricelist' : 'exact' }; }
  }
  // 2. Historical ERP code match (different order, same product code)
  if (kb) {
    const hist = RAW.so.find(s => s.so_pcs > 0 && s.product && s.product.toLowerCase().trim() === kb && _sameUnitClass(s));
    if (hist) { const r = _histRev(hist); return { value: r.value, tier: r.capped ? 'pricelist' : 'hist-code' }; }
  }
  // 2b. Historical name match: exact → prefix → token fuzzy (unit-preferred, not required — already approximate)
  if (nama_brg) {
    const nb = _norm(nama_brg);
    const histExact = RAW.so.find(s => s.so_pcs > 0 && s.product && _norm(s.product) === nb);
    if (histExact) { const r = _histRev(histExact); return { value: r.value, tier: r.capped ? 'pricelist' : 'hist-name' }; }
    if (nb.length >= 10) {
      const histPrefix = RAW.so.find(s => s.so_pcs > 0 && s.product && _norm(s.product).startsWith(nb));
      if (histPrefix) { const r = _histRev(histPrefix); return { value: r.value, tier: r.capped ? 'pricelist' : 'hist-name' }; }
    }
    // token fuzzy — prefer same unit; threshold 2 handles short names like "Borello Rump"
    let bestHist = null, bestHistScore = 0;
    for (const s of RAW.so) {
      if (!s.so_pcs || !s.product) continue;
      let score = _tokScore(nb, s.product);
      if (su && s.unit && s.unit.toUpperCase() === su) score += 2;
      if (score >= 2 && score > bestHistScore) { bestHistScore = score; bestHist = s; }
    }
    if (bestHist) { const r = _histRev(bestHist); return { value: r.value, tier: r.capped ? 'pricelist' : 'hist-name' }; }
  }
  // 3. PRODUCTS pricelist fallback
  if (plPrice) return { value: plPrice * qty_so, tier: 'pricelist' };
  return { value: 0, tier: 'none' };
}

function buildTomorrowDeliveryHtml(lines) {
  if (isFJStale(lines)) {
    const _msg = (!lines.length && _fjHasAnyData())
      ? 'No deliveries found for you in today’s warehouse file'
      : 'Warehouse file not yet uploaded · check back later';
    return `<div class="today-card">
      <div class="tc-title tc-title-tomorrow">${uiIcon('truck',14)} Next Deliveries</div>
      <div class="tc-coming-soon">${_msg}</div>
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
      <div class="tc-title tc-title-tomorrow">${uiIcon('truck',14)} Next Deliveries</div>
      <div class="tc-coming-soon">Next delivery plan not yet uploaded · check back later</div>
    </div>`;
  }
  const custMap = {}, custOrder = [];
  const soMap = {}, soOrder = [];
  lines.forEach(r => {
    const soKey = r.no_so;
    if (!soMap[soKey]) { soMap[soKey] = { no_so: r.no_so, customer: r.nama_cust, items: [], total: 0, hasUnfulfilled: false, hasPartial: false }; soOrder.push(soKey); }
    const effQty = r.qty_bs > 0 ? r.qty_bs : r.qty_so;
    const { value: rev, tier: revTier } = _fjLookupRevenue(r.no_so, r.kode_brg, r.nama_brg, effQty, r.satuan);
    soMap[soKey].items.push({ ...r, rev, revTier });
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
    ? 'Next Deliveries'
    : 'Deliveries · ' + _maxDNorm.toLocaleDateString('id-ID', { weekday:'short', day:'numeric', month:'short' });
  let h = `<div class="today-card">
    <div class="tc-title tc-title-tomorrow">${uiIcon('truck',14)} ${_fjLabel} · ${fmtShort(totalRev)} (${uniqueSOs} SO · ${custOrder.length} Cust)</div>
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
        const isEstimate = o.revTier && o.revTier !== 'exact';
        const revHtml = o.rev > 0 ? `<div class="tc-so-rev${isEstimate ? ' tc-so-rev-est' : ''}">${isEstimate ? '~' : ''}${fmtShort(o.rev)}</div>` : '';
        h += `<div class="tc-so-row"><div class="tc-so-prod">${o.nama_brg}</div><div class="tc-so-qty${isPartial ? ' low' : ''}">${qtyDisplay}</div>${flagHtml}${revHtml}</div>`;
      });
      h += `</div>`;
    });
    h += `</div>`;
  });
  h += `</div></div>`;
  return h;
}

// Manager-facing rollup of buildTomorrowDeliveryHtml: same data (call with
// getFJData(null, false)) and the same SO/item detail, but grouped by sales
// rep first — each SO's customer + no. shown together on one subheader line
// so a manager can see every rep's upcoming deliveries in one place.
function buildTomorrowDeliveryByRepHtml(lines) {
  if (isFJStale(lines)) {
    return `<div class="today-card">
      <div class="tc-title tc-title-tomorrow">${uiIcon('truck',14)} Next Deliveries</div>
      <div class="tc-coming-soon">Warehouse file not yet uploaded · check back later</div>
    </div>`;
  }
  const _now = new Date(); _now.setHours(0,0,0,0);
  const _maxD = lines.reduce((m,r) => (r.delivery_date && r.delivery_date > m ? r.delivery_date : m), new Date(0));
  const _maxDNorm = new Date(_maxD); _maxDNorm.setHours(0,0,0,0);
  if (!(_maxDNorm > _now)) {
    return `<div class="today-card">
      <div class="tc-title tc-title-tomorrow">${uiIcon('truck',14)} Next Deliveries</div>
      <div class="tc-coming-soon">Next delivery plan not yet uploaded · check back later</div>
    </div>`;
  }
  const soMap = {}, soOrder = [];
  lines.forEach(r => {
    const soKey = r.no_so;
    if (!soMap[soKey]) { soMap[soKey] = { no_so: r.no_so, customer: r.nama_cust, sales: r.nama_sales || 'Unknown', items: [], total: 0, hasUnfulfilled: false, hasPartial: false }; soOrder.push(soKey); }
    const effQty = r.qty_bs > 0 ? r.qty_bs : r.qty_so;
    const { value: rev, tier: revTier } = _fjLookupRevenue(r.no_so, r.kode_brg, r.nama_brg, effQty, r.satuan);
    soMap[soKey].items.push({ ...r, rev, revTier });
    soMap[soKey].total += rev;
    if (r.ket === 'UNFULFILLED') soMap[soKey].hasUnfulfilled = true;
    if (r.qty_bs > 0 && Math.round(r.qty_bs) < Math.round(r.qty_so)) soMap[soKey].hasPartial = true;
  });
  const repMap = {}, repOrder = [];
  soOrder.forEach(k => {
    const so = soMap[k];
    if (!repMap[so.sales]) { repMap[so.sales] = { sos: [], total: 0 }; repOrder.push(so.sales); }
    repMap[so.sales].sos.push(so);
    repMap[so.sales].total += so.total;
  });
  repOrder.sort((a, b) => repMap[b].total - repMap[a].total);
  const totalRev = repOrder.reduce((s, rep) => s + repMap[rep].total, 0);
  const uniqueSOs = soOrder.length;
  const _tmr = new Date(); _tmr.setDate(_tmr.getDate() + 1); _tmr.setHours(0,0,0,0);
  const _fjLabel = _maxDNorm.getTime() === _tmr.getTime()
    ? 'Next Deliveries'
    : 'Deliveries · ' + _maxDNorm.toLocaleDateString('id-ID', { weekday:'short', day:'numeric', month:'short' });
  let h = `<div class="today-card">
    <div class="tc-title tc-title-tomorrow">${uiIcon('truck',14)} ${_fjLabel} · ${fmtShort(totalRev)} (${uniqueSOs} SO · ${repOrder.length} Reps)</div>
    <div class="tc-so">`;
  repOrder.forEach(rep => {
    const rg = repMap[rep];
    h += `<div class="tc-so-group"><div class="tc-so-cust-hdr"><div class="tc-so-cust">${escHtml(rep)}</div><div class="tc-so-cust-total">${fmtShort(rg.total)}</div></div>`;
    rg.sos.forEach(g => {
      const stClass = g.hasUnfulfilled ? 'critical' : (g.hasPartial ? 'low' : 'ok');
      const stLabel = g.hasUnfulfilled ? 'Partial/Unfulfilled' : (g.hasPartial ? 'Partial' : 'Fulfilled');
      h += `<div class="tc-so-subgroup"><div class="tc-so-subhdr"><div class="tc-so-no">${escHtml(g.customer)} · ${g.no_so}</div><div class="tc-so-status ${stClass}">${stLabel}</div></div>`;
      g.items.forEach(o => {
        const flagHtml = o.ket === 'UNFULFILLED' ? `<div class="tc-so-ket critical">UNFULFILLED</div>` : '';
        const isPartial = o.qty_bs > 0 && Math.round(o.qty_bs) < Math.round(o.qty_so);
        const qtyDisplay = isPartial ? `${fmtNum(o.qty_bs)} / ${fmtNum(o.qty_so)} ${o.satuan}` : `${fmtNum(o.qty_so)} ${o.satuan}`;
        const isEstimate = o.revTier && o.revTier !== 'exact';
        const revHtml = o.rev > 0 ? `<div class="tc-so-rev${isEstimate ? ' tc-so-rev-est' : ''}">${isEstimate ? '~' : ''}${fmtShort(o.rev)}</div>` : '';
        h += `<div class="tc-so-row"><div class="tc-so-prod">${o.nama_brg}</div><div class="tc-so-qty${isPartial ? ' low' : ''}">${qtyDisplay}</div>${flagHtml}${revHtml}</div>`;
      });
      h += `</div>`;
    });
    h += `</div>`;
  });
  h += `</div></div>`;
  return h;
}

// Flags UNFULFILLED lines plus PARTIAL deliveries (qty_bs < qty_so), and
// annotates each with its missing qty and estimated lost revenue on that
// missing qty (full qty_so for UNFULFILLED, the shortfall for PARTIAL).
function _fjFlagPartialUnfulfilled(lines) {
  return lines
    .filter(r => r.ket === 'UNFULFILLED' || (r.qty_bs > 0 && Math.round(r.qty_bs) < Math.round(r.qty_so)))
    .map(r => {
      const isPartial = r.ket !== 'UNFULFILLED';
      const missingQty = isPartial ? Math.max(0, r.qty_so - r.qty_bs) : r.qty_so;
      const { value: lost, tier: lostTier } = _fjLookupRevenue(r.no_so, r.kode_brg, r.nama_brg, missingQty, r.satuan);
      return { ...r, isPartial, missingQty, lost_rev: lost, lostTier };
    });
}

function _fjFlaggedRowHtml(r) {
  const badgeCls = r.isPartial ? 'low' : 'critical';
  const badgeLabel = r.isPartial ? 'PARTIAL' : 'UNFULFILLED';
  const qtyDisplay = r.isPartial ? `${fmtNum(r.qty_bs)} / ${fmtNum(r.qty_so)} ${r.satuan}` : `${fmtNum(r.qty_so)} ${r.satuan}`;
  const isEstimate = r.lostTier && r.lostTier !== 'exact';
  const lostHtml = r.lost_rev > 0 ? `${isEstimate ? '~' : ''}${fmtShort(r.lost_rev)}` : '—';
  return `<div class="tc-so-row"><div class="tc-so-prod">${r.nama_brg}</div><div class="tc-so-qty${r.isPartial ? ' low' : ''}">${qtyDisplay}</div><div class="tc-so-ket ${badgeCls}">${badgeLabel}</div><div class="tc-so-rev${isEstimate && r.lost_rev > 0 ? ' tc-so-rev-est' : ''}">${lostHtml}</div></div>`;
}

// Shown instead of a blank gap whenever there's no fresh today-file to
// report on yet — mirrors buildTomorrowDeliveryHtml's own placeholder so the
// section never just silently disappears.
function _fjUnfulfilledPlaceholderHtml(noRowsForRepButFileLoaded) {
  const _msg = noRowsForRepButFileLoaded
    ? 'No unfulfilled or partial items found for you in today’s warehouse file'
    : 'Warehouse file not yet uploaded · check back later';
  return `<div class="today-card">
    <div class="tc-title tc-title-lost">Unfulfilled &amp; Partial</div>
    <div class="tc-coming-soon">${_msg}</div>
  </div>`;
}

function buildUnfulfilledHtml(lines) {
  if (!lines.length) return _fjUnfulfilledPlaceholderHtml(_fjHasAnyData()); // no rows for this rep — distinguish from "no file loaded at all"
  if (isFJStale(lines)) return _fjUnfulfilledPlaceholderHtml(); // today's file not yet fresh — don't show possibly-resolved old items
  const flagged = _fjFlagPartialUnfulfilled(lines);
  if (!flagged.length) {
    return `<div class="today-card tc-unfulfilled-ok">
      <div class="tc-title" style="color:var(--green)">✓ Unfulfilled &amp; Partial · All items fulfilled</div>
    </div>`;
  }
  // Group by customer
  let totalLost = 0;
  const custMap = {}, custOrder = [];
  flagged.forEach(r => {
    totalLost += r.lost_rev;
    if (!custMap[r.nama_cust]) { custMap[r.nama_cust] = { items: [], total: 0 }; custOrder.push(r.nama_cust); }
    custMap[r.nama_cust].items.push(r);
    custMap[r.nama_cust].total += r.lost_rev;
  });
  let h = `<div class="today-card tc-unfulfilled">
    <div class="tc-title tc-title-lost"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg> Unfulfilled &amp; Partial · ${fmtShort(totalLost)} lost (${flagged.length} items)</div>
    <div class="tc-so">`;
  custOrder.forEach(cust => {
    const c = custMap[cust];
    h += `<div class="tc-so-group"><div class="tc-so-cust-hdr"><div class="tc-so-cust">${cust}</div><div class="tc-so-cust-total tc-lost-total">${fmtShort(c.total)}</div></div>`;
    c.items.forEach(r => { h += _fjFlaggedRowHtml(r); });
    h += `</div>`;
  });
  h += `</div></div>`;
  return h;
}

// Manager-facing rollup: same UNFULFILLED + PARTIAL data as buildUnfulfilledHtml,
// but spanning every rep (call with getFJData(null, false), same lines as the
// deliveries card above) and grouped by sales rep first, then by customer, so
// a manager can see whose orders need chasing.
function buildUnfulfilledByRepHtml(lines) {
  if (!lines.length) return _fjUnfulfilledPlaceholderHtml();
  if (isFJStale(lines)) return _fjUnfulfilledPlaceholderHtml();
  const flagged = _fjFlagPartialUnfulfilled(lines);
  if (!flagged.length) {
    return `<div class="today-card tc-unfulfilled-ok">
      <div class="tc-title" style="color:var(--green)">✓ Unfulfilled &amp; Partial · All items fulfilled</div>
    </div>`;
  }
  let totalLost = 0;
  const repMap = {}, repOrder = [];
  flagged.forEach(r => {
    totalLost += r.lost_rev;
    const rep = r.nama_sales || 'Unknown';
    if (!repMap[rep]) { repMap[rep] = { custMap: {}, custOrder: [], total: 0 }; repOrder.push(rep); }
    const rg = repMap[rep];
    if (!rg.custMap[r.nama_cust]) { rg.custMap[r.nama_cust] = { items: [], total: 0 }; rg.custOrder.push(r.nama_cust); }
    rg.custMap[r.nama_cust].items.push(r);
    rg.custMap[r.nama_cust].total += r.lost_rev;
    rg.total += r.lost_rev;
  });
  repOrder.sort((a, b) => repMap[b].total - repMap[a].total);
  let h = `<div class="today-card tc-unfulfilled">
    <div class="tc-title tc-title-lost"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg> Unfulfilled &amp; Partial · ${fmtShort(totalLost)} lost (${flagged.length} items · ${repOrder.length} reps)</div>
    <div class="tc-so">`;
  repOrder.forEach(rep => {
    const rg = repMap[rep];
    h += `<div class="tc-so-group"><div class="tc-so-cust-hdr"><div class="tc-so-cust">${escHtml(rep)}</div><div class="tc-so-cust-total tc-lost-total">${fmtShort(rg.total)}</div></div>`;
    rg.custOrder.forEach(cust => {
      const c = rg.custMap[cust];
      h += `<div class="tc-so-subgroup"><div class="tc-so-subhdr"><div class="tc-so-no">${escHtml(cust)}</div></div>`;
      c.items.forEach(r => { h += _fjFlaggedRowHtml(r); });
      h += `</div>`;
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
// Feature modules (lib/auth.js, features/competitor-intel.js, ...) are
// <script type="module"> tags that import the Supabase SDK from a CDN —
// that network fetch can outlast the local data-load chain that triggers
// _showLogin(), so window.AppAuth/window.CompetitorIntel aren't guaranteed
// to exist yet when they're first needed. Poll briefly instead of assuming
// module-script load order.
function waitForGlobal(key) {
  if (window[key]) return Promise.resolve();
  return new Promise(resolve => {
    const check = () => window[key] ? resolve() : setTimeout(check, 20);
    check();
  });
}

// Same as waitForGlobal, but gives up after `ms` instead of polling forever —
// for globals that load lazily off a CDN (e.g. XLSX) and may never arrive if
// the rep is offline when that script fails to fetch.
function waitForGlobalTimeout(key, ms) {
  return Promise.race([
    waitForGlobal(key).then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), ms)),
  ]);
}

// ════════════════
// OFFLINE WRITE QUEUE
// ════════════════
// Replays one queued item against the same feature-bridge calls its call
// site already makes on the live path (lib/write-queue.js's drain() just
// defers *when* this runs, not *what* it does). Compound actions (an intel
// log plus an optional photo) are bundled into a single queue item and
// replayed in one go here, rather than split across two queue items — the
// photo step needs the log's real id, which only exists once createLog()
// above it in this same function has actually run.
async function _replayQueueItem(item) {
  const { type, payload, blob } = item;
  switch (type) {
    case 'intel-create': {
      const row = await window.CompetitorIntel.createLog(payload);
      if (blob) {
        const photoUrl = await window.CompetitorIntel.uploadPhoto(payload.rep_id, row.id, blob);
        await window.CompetitorIntel.updateLog(row.id, { photo_url: photoUrl });
      }
      break;
    }
    case 'intel-update': {
      await window.CompetitorIntel.updateLog(payload.id, payload.fields);
      if (blob) {
        const photoUrl = await window.CompetitorIntel.uploadPhoto(payload.rep_id, payload.id, blob);
        await window.CompetitorIntel.updateLog(payload.id, { photo_url: photoUrl });
      }
      break;
    }
    case 'intel-delete':
      await window.CompetitorIntel.deleteLog(payload.id);
      break;
    case 'deal-create':
      await window.Deals.createDeal(payload);
      break;
    case 'deal-status':
      await window.Deals.updateDealStatus(payload.id, payload.status);
      break;
    case 'contact-create':
      await window.CustomerRelations.createContact(payload);
      break;
    case 'contact-update':
      await window.CustomerRelations.updateContact(payload.id, payload.fields);
      break;
    case 'contact-delete':
      await window.CustomerRelations.deleteContact(payload.id);
      break;
    case 'visit-create':
      await window.CustomerRelations.createVisit(payload);
      break;
    case 'profile-phone':
      await window.RepProfile.updatePhone(payload.repId, payload.phone);
      break;
    case 'profile-photo':
      await window.RepProfile.uploadPhoto(payload.repId, blob);
      break;
    case 'announcement-create': {
      const target_rep_id = payload.targetName ? await window.Announcements.resolveRepIdByName(payload.targetName) : null;
      await window.Announcements.createAnnouncement({
        author_rep_id: payload.author_rep_id, target_rep_id, title: payload.title, message: payload.message, category: payload.category,
      });
      break;
    }
    default:
      console.warn('WriteQueue: unknown item type, dropping', type);
  }
}

function _updateQueueBadge(n) {
  const btn = document.getElementById('wq-btn');
  const badge = document.getElementById('wq-badge');
  if (!btn || !badge) return;
  if (n > 0) { badge.textContent = n; btn.classList.remove('hidden'); badge.classList.remove('hidden'); }
  else { btn.classList.add('hidden'); badge.classList.add('hidden'); }
}

async function _drainWriteQueue() {
  if (!window.WriteQueue) return;
  const before = await window.WriteQueue.pending();
  if (!before) return;
  await window.WriteQueue.drain(_replayQueueItem);
  const after = await window.WriteQueue.pending();
  if (after < before) showToast(`Synced ${before - after} pending item${before - after === 1 ? '' : 's'}`);
}

if (window.WriteQueue) {
  window.WriteQueue.onChange(_updateQueueBadge);
  // Drain first (so a synced write's own screen has something fresh to
  // show), then refresh — covers reconnect even when nothing was queued,
  // and makes anything that just synced (e.g. a deleted Intel entry) show
  // up without the rep having to do anything else.
  window.addEventListener('online', () => _drainWriteQueue().then(() => _refreshCurrentScreen()));
  if (navigator.onLine) _drainWriteQueue();
}

function buildLogin() {
  const sel = document.getElementById('rep-select');
  if (!sel) return; // loading screen is showing, not ready yet
  // Add optgroups
  const fieldReps = REP_CONFIG.filter(r => !r.area.includes('Nestlé') && r.div !== 'MGMT');
  const nestleReps = REP_CONFIG.filter(r => r.area.includes('Nestlé'));
  const mgmtReps = REP_CONFIG.filter(r => r.div === 'MGMT');

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

  let grp3 = document.createElement('optgroup');
  grp3.label = 'Management';
  mgmtReps.forEach(rep => {
    const idx = REP_CONFIG.indexOf(rep);
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = rep.name;
    grp3.appendChild(opt);
  });

  sel.appendChild(grp1);
  sel.appendChild(grp2);
  sel.appendChild(grp3);

  // Session validity is decided by _bootAuth() in index.html before this
  // function ever runs — pre-select the dropdown here as a UX convenience
  // only, opening the PIN pad for whichever rep last used this device.
  const saved = localStorage.getItem('mkuv2_saved_rep');
  if (saved !== null) {
    const savedIdx = parseInt(saved);
    if (!isNaN(savedIdx) && REP_CONFIG[savedIdx]) {
      sel.value = savedIdx;
      showPinPad(savedIdx);
    }
  }
}

function onRepSelect(sel) {
  const idx = parseInt(sel.value);
  if (isNaN(idx)) return;
  showPinPad(idx);
}

// ── PIN PAD ──
const PIN_LENGTH = 6; // Supabase enforces a 6-char minimum password length
let _pinRepIdx = null;
let _pinBuffer = '';
// Mode state machine for the forced-PIN-change flow: a rep whose
// must_change_pin flag is true gets routed through 'set' → 'confirm'
// before selectRep() ever runs, reusing this same pad UI.
let _pinMode = 'login'; // 'login' | 'set' | 'confirm'
let _pendingRepRow = null;
let _pendingNewPin = '';
// Super Admin's own identity, cached at real login so exitViewAs() can
// restore it after previewing another rep's profile.
let _superAdminOwnIdx = null;
let _superAdminOwnAuthInfo = null;
// Set true only while viewAsRep() is swapping identity, so selectRep()'s
// auto-open-popup logic (Bisdev/Nestle Coordinator) skips itself — a real
// login into those roles should still auto-open, previewing one via Super
// Admin's picker shouldn't pop a popup on top of the Target tab that's
// already showing the same content underneath.
let _suppressAutoPopup = false;
// When viewAsRep() previews a rep whose REP_CONFIG display name (e.g.
// "Vacant") differs from the real underlying reps.name (dbName field),
// REP_CONFIG[idx].name is temporarily swapped to the real name so every
// existing name-keyed lookup (renderTarget, getFJData, getTodaySO,
// getRepCustomerList via window._currentRep, etc.) resolves real data —
// then the visible topbar/banner text is patched back to the display name.
// These track the swap so it can be reliably undone.
let _viewingAsMutatedIdx = null;
let _viewingAsMutatedOriginalName = null;

function showPinPad(idx) {
  _pinRepIdx = idx;
  _pinBuffer = '';
  _pinMode = 'login';
  _pendingRepRow = null;
  _pendingNewPin = '';
  document.getElementById('login-select-wrap').classList.add('hidden');
  document.getElementById('login-pin-wrap').classList.remove('hidden');
  document.getElementById('login-pin-name').textContent = REP_CONFIG[idx].name;
  document.getElementById('login-pin-error').innerHTML = '&nbsp;';
  renderPinDots();
  setPinKeypadDisabled(false);
}

function renderPinDots() {
  const wrap = document.getElementById('login-pin-dots');
  wrap.innerHTML = '';
  for (let i = 0; i < PIN_LENGTH; i++) {
    const dot = document.createElement('div');
    dot.className = 'login-pin-dot' + (i < _pinBuffer.length ? ' filled' : '');
    wrap.appendChild(dot);
  }
}

function setPinKeypadDisabled(disabled) {
  document.querySelectorAll('#login-pin-keypad .login-pin-key:not(.login-pin-key--ghost)')
    .forEach(btn => btn.disabled = disabled);
}

function onPinDigit(d) {
  if (_pinBuffer.length >= PIN_LENGTH) return;
  _pinBuffer += d;
  renderPinDots();
  if (_pinBuffer.length !== PIN_LENGTH) return;

  if (_pinMode === 'login') {
    submitPin();
  } else if (_pinMode === 'set') {
    _pendingNewPin = _pinBuffer;
    _pinBuffer = '';
    _pinMode = 'confirm';
    document.getElementById('login-pin-name').textContent = 'Confirm your new PIN';
    document.getElementById('login-pin-error').innerHTML = '&nbsp;';
    renderPinDots();
  } else if (_pinMode === 'confirm') {
    if (_pinBuffer === _pendingNewPin) {
      finishPinChange();
    } else {
      _pinMode = 'set';
      _pendingNewPin = '';
      _pinBuffer = '';
      document.getElementById('login-pin-name').textContent = 'Choose a new PIN';
      document.getElementById('login-pin-error').textContent = "PINs didn't match. Try again.";
      renderPinDots();
    }
  }
}

function onPinBackspace() {
  if (!_pinBuffer.length) return;
  _pinBuffer = _pinBuffer.slice(0, -1);
  document.getElementById('login-pin-error').innerHTML = '&nbsp;';
  renderPinDots();
}

function onPinBack() {
  _pinRepIdx = null;
  _pinBuffer = '';
  _pinMode = 'login';
  _pendingRepRow = null;
  _pendingNewPin = '';
  document.getElementById('login-pin-wrap').classList.add('hidden');
  document.getElementById('login-select-wrap').classList.remove('hidden');
}

// Data (RAW/CUSTOMERS/FJ_*) now requires an authenticated session to fetch
// (see index.html's boot sequence + lib/dashboard-data.js) — a rep logging
// in fresh on a device with no prior session (window._dataPending, set at
// boot) has no data loaded yet, so selectRep() (which assumes RAW already
// exists) can't run until it's fetched here, right after a successful login.
async function _ensureDataLoaded(errEl) {
  if (!window._dataPending) return true;
  errEl.textContent = 'Loading your dashboard…';
  try {
    await window._loadAllData();
    window._dataPending = false;
    return true;
  } catch (e) {
    console.error('post-login data load failed:', e);
    errEl.textContent = 'Could not load data — check connection.';
    return false;
  }
}

async function submitPin() {
  const idx = _pinRepIdx;
  const pin = _pinBuffer;
  setPinKeypadDisabled(true);
  try {
    await waitForGlobal('AppAuth');
    const repRow = await window.AppAuth.login(REP_CONFIG[idx].name, pin);
    if (repRow.must_change_pin) {
      _pendingRepRow = repRow;
      _pinMode = 'set';
      _pinBuffer = '';
      document.getElementById('login-pin-name').textContent = 'Choose a new PIN';
      document.getElementById('login-pin-error').textContent = 'This replaces your temporary PIN.';
      renderPinDots();
      setPinKeypadDisabled(false);
      return;
    }
    const authInfo = { repId: repRow.id, authUserId: repRow.auth_user_id, isManager: repRow.is_manager, phone: repRow.phone, photoUrl: repRow.photo_url, bisdevCategory: repRow.bisdev_category, isNestleCoordinator: repRow.is_nestle_coordinator, isSuperAdmin: repRow.is_super_admin };
    if (repRow.is_super_admin) { _superAdminOwnIdx = idx; _superAdminOwnAuthInfo = authInfo; }
    if (!(await _ensureDataLoaded(document.getElementById('login-pin-error')))) { setPinKeypadDisabled(false); return; }
    selectRep(idx, authInfo);
  } catch (e) {
    console.error('submitPin error:', e);
    _pinBuffer = '';
    renderPinDots();
    // 'bad_pin' = genuinely wrong PIN. Anything else (missing/inactive rep
    // row, auth_user_id mismatch, network/RLS error) is not a typo the rep
    // can fix by retrying — say so instead of implying they mistyped.
    document.getElementById('login-pin-error').textContent =
      e?.code === 'bad_pin' ? 'Incorrect PIN. Try again.' : 'Login error — contact your manager.';
    setPinKeypadDisabled(false);
  }
}

async function finishPinChange() {
  setPinKeypadDisabled(true);
  try {
    await waitForGlobal('AppAuth');
    await window.AppAuth.changePin(_pendingNewPin);
    const idx = _pinRepIdx;
    const repRow = _pendingRepRow;
    const authInfo = { repId: repRow.id, authUserId: repRow.auth_user_id, isManager: repRow.is_manager, phone: repRow.phone, photoUrl: repRow.photo_url, bisdevCategory: repRow.bisdev_category, isNestleCoordinator: repRow.is_nestle_coordinator, isSuperAdmin: repRow.is_super_admin };
    if (repRow.is_super_admin) { _superAdminOwnIdx = idx; _superAdminOwnAuthInfo = authInfo; }
    if (!(await _ensureDataLoaded(document.getElementById('login-pin-error')))) { setPinKeypadDisabled(false); return; }
    selectRep(idx, authInfo);
  } catch (e) {
    console.error('finishPinChange error:', e);
    _pinMode = 'set';
    _pendingNewPin = '';
    _pinBuffer = '';
    document.getElementById('login-pin-name').textContent = 'Choose a new PIN';
    const reason = e?.raw?.message || e?.message || 'Unknown error';
    document.getElementById('login-pin-error').textContent = "Couldn't save new PIN — " + reason;
    renderPinDots();
    setPinKeypadDisabled(false);
  }
}

function selectRep(idx, authInfo) {
  try {
    currentRep = REP_CONFIG[idx];
    currentRep._color = COLORS[idx % COLORS.length];
    if (authInfo) {
      currentRep.repId = authInfo.repId;
      currentRep.authUserId = authInfo.authUserId;
      currentRep.isManager = authInfo.isManager;
      currentRep.phone = authInfo.phone;
      currentRep.photoUrl = authInfo.photoUrl;
      currentRep.bisdevCategory = authInfo.bisdevCategory;
      currentRep.isNestleCoordinator = authInfo.isNestleCoordinator;
      currentRep.isSuperAdmin = authInfo.isSuperAdmin;
    }
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
    refreshTopbarAvatar();
    const d = new Date(RAW.latest);
    document.getElementById('topbar-date').textContent =
      d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'2-digit' });
    try { renderTarget(); } catch(e) {
      console.error('renderTarget error:', e);
      document.getElementById('target-body').innerHTML =
        '<div style="padding:20px;color:red;font-size:.8rem">Target data error: ' + e.message + '</div>';
    }
    document.getElementById('today-date').textContent =
      d.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long' });
    initTodayPriorities();
    // Manager login: land on Target (renderTarget() above already rendered
    // the company-wide view there) instead of Today, since a Manager has
    // no personal customer portfolio for Today to show.
    if (currentRep.isManager || currentRep.isSuperAdmin) { switchTab('target'); }
    // Bisdev/Nestle Coordinator login: same company-wide-only situation as
    // Manager, but the dashboard is presented as a popup that opens
    // immediately on login rather than requiring a tap into the Target tab.
    if (currentRep.bisdevCategory && !_suppressAutoPopup) { openBisdevDashboard(currentRep.bisdevCategory); }
    if (currentRep.isNestleCoordinator && !_suppressAutoPopup) { openNestleCoordinatorDashboard(); }
    // Order's customer-suggestion panel needs a personal customer portfolio
    // a Manager/Bisdev/Coordinator/Super Admin rep doesn't have, so hide the tab rather than leave it half-functional.
    document.getElementById('bnav-order').classList.toggle('hidden', !!(currentRep.isManager || currentRep.bisdevCategory || currentRep.isNestleCoordinator || currentRep.isSuperAdmin));
    // Downloads are Manager/Super Admin only — hide the export buttons from everyone else.
    const _canDownload = !!(currentRep.isManager || currentRep.isSuperAdmin);
    document.getElementById('export-customers-btn')?.classList.toggle('hidden', !_canDownload);
    document.getElementById('export-intel-btn')?.classList.toggle('hidden', !_canDownload);
    // A real Super Admin login (not a view-as swap) starts clean, not mid-preview.
    if (currentRep.isSuperAdmin) {
      window._viewingAs = false;
      const banner = document.getElementById('view-as-banner');
      if (banner) banner.classList.add('hidden');
    }
    // If customers tab is already open, refresh it immediately for the new rep
    const custScreen = document.getElementById('screen-customers');
    if (custScreen && custScreen.classList.contains('active')) {
      initCustomers();
    }
    // Live announcements — fetch + bell badge + auto-show-if-Urgent
    loadAnnouncements();
  } catch(e) {
    console.error('selectRep error:', e);
    alert('Login error: ' + e.message);
  }
}

function logout() {
  currentRep = null;
  window._currentRep = null;
  orderItems = {};
  _superAdminOwnIdx = null;
  _superAdminOwnAuthInfo = null;
  _restoreViewAsNameSwap();
  window._viewingAs = false;
  const banner = document.getElementById('view-as-banner');
  if (banner) banner.classList.add('hidden');
  localStorage.removeItem('mkuv2_saved_rep');
  window.AppAuth.logout();
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-pin-wrap').classList.add('hidden');
  document.getElementById('login-select-wrap').classList.remove('hidden');
  const sel = document.getElementById('rep-select');
  if (sel) sel.value = '';
  _pinRepIdx = null;
  _pinBuffer = '';
  switchTab('today');
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
  if (tab === 'intel') { initIntel(); }
  if (tab === 'today') { initTodayPriorities(); }
  // Catalog PDFs (~20MB combined) are only fetched once the rep actually
  // opens this tab, not on every login — prefetchCatalogBlobs() is
  // idempotent, so repeat tab opens are a no-op.
  if (tab === 'catalog') { prefetchCatalogBlobs(); }
}

// Re-fetches sales + customer data and re-renders whichever screen is
// currently active — generalizes the old Target-only _refreshDataInPlace()
// (index.html) so a manual refresh, a network reconnect, or resuming from
// the background all update whatever the rep is actually looking at, not
// just Target. Callable from index.html's classic-script scope too (shares
// the same global scope as this file — both are plain <script> tags, not
// modules), so no window.* export needed, but kept explicit for clarity.
let _refreshInFlight = false;
async function _refreshCurrentScreen(opts) {
  opts = opts || {};
  if (_refreshInFlight || !window.DashboardData) return;
  _refreshInFlight = true;
  document.getElementById('refresh-btn')?.classList.add('spinning');
  try {
    try {
      await window.DashboardData.loadSales();
      await window.DashboardData.loadCustomers();
      window._customersReady = true;
    } catch (e) {
      console.warn('_refreshCurrentScreen: data reload failed', e);
      if (opts.showToast) showToast("Couldn't refresh — check connection");
      return;
    }
    const activeEl = document.querySelector('.screen.active');
    const tab = activeEl ? activeEl.id.replace('screen-', '') : null;
    try {
      if (tab === 'target') { renderTarget(); }
      else if (tab === 'price') { renderPricelist(); }
      else if (tab === 'stock') { renderStock(); }
      else if (tab === 'order') { renderOrder(); }
      else if (tab === 'customers') { initCustomers(); }
      else if (tab === 'intel') { initIntel(); }
      else if (tab === 'today') { initTodayPriorities(); }
      // 'catalog' doesn't depend on RAW/CUSTOMERS — nothing to re-render.
    } catch (e) {
      console.error('_refreshCurrentScreen render error:', e);
    }
    if (opts.showToast) showToast('Refreshed');
  } finally {
    _refreshInFlight = false;
    document.getElementById('refresh-btn')?.classList.remove('spinning');
  }
}
window._refreshCurrentScreen = _refreshCurrentScreen;

// ════════════════
// TODAY PRIORITIES
// ════════════════
async function initTodayPriorities() {
  const el = document.getElementById('today-body');
  if (!el) return;
  el.innerHTML = `<div class="cust-loading">
    <div class="cust-loading-spinner"></div>
    <div class="cust-loading-txt">Checking today's priorities…</div>
  </div>`;
  try {
    await waitForGlobal('TodayPriorities');
    const [contactedKeys, lastVisitByKey] = await Promise.all([
      window.TodayPriorities.fetchContactedKeys(),
      window.TodayPriorities.fetchLastVisitByKey(),
    ]);
    renderTodayPriorities(buildTodayPriorities(contactedKeys, lastVisitByKey));
  } catch (e) {
    console.error('initTodayPriorities error:', e);
    el.innerHTML = `<div class="cust-empty">Couldn't load today's priorities.</div>`;
  }
}

function buildTodayPriorities(contactedKeys, lastVisitByKey) {
  const contactedSet = new Set(contactedKeys);
  const customers = typeof CUSTOMERS !== 'undefined' ? getRepCustomerList() : [];
  const now = new Date();

  const inactive = [], dropped = [], opportunity = [], noContact = [], staleVisit = [], stockAlert = [];

  customers.forEach(c => {
    const mAgo = monthsSinceLastOrder(c);
    if (mAgo >= 2) {
      inactive.push({ c, detail: `${mAgo} months since last order` });
    } else {
      const growth = getGrowth(c.monthly);
      if (growth !== null && growth <= -15) dropped.push({ c, detail: `${growth}% vs previous month` });
    }

    const sugg = getPitchSuggestions(c);
    if (sugg.length) opportunity.push({ c, detail: `${sugg.length} untapped categor${sugg.length===1?'y':'ies'}` });

    const key = normalizedKey(c.name, c.area);
    if (!contactedSet.has(key)) noContact.push({ c, detail: 'No contact on file' });

    const lastVisit = lastVisitByKey[key];
    if (!lastVisit) {
      staleVisit.push({ c, detail: 'No visit note ever logged' });
    } else {
      const days = Math.round((now - new Date(lastVisit)) / 86400000);
      if (days > 60) staleVisit.push({ c, detail: `${days} days since last visit note` });
    }

    // Stock heads-up — only this month's products, keeps the fuzzy stock
    // lookup cheap and focused on what's actually relevant right now.
    const recentNames = [...new Set((c.products||[]).filter(p => p.month === c.last_month).map(p => p.name))];
    for (const name of recentNames) {
      const stockItem = getStockItem(name);
      if (stockItem && (stockItem.st === 'critical' || stockItem.st === 'out')) {
        stockAlert.push({ c, detail: `${stockItem.name} is ${stockItem.st === 'out' ? 'out of stock' : 'critical'}` });
        break;
      }
    }
  });

  const topN = arr => arr.sort((a,b) => (b.c.total||0) - (a.c.total||0)).slice(0, 5);
  return {
    inactive: topN(inactive), dropped: topN(dropped), opportunity: topN(opportunity),
    noContact: topN(noContact), staleVisit: topN(staleVisit), stockAlert: topN(stockAlert),
    drafts: getDrafts(),
  };
}

function renderTodayPriorities(p) {
  const el = document.getElementById('today-body');
  const sections = [
    { label: 'Inactive Customers', items: p.inactive, action: 'cust' },
    { label: 'Dropped / Declining', items: p.dropped, action: 'cust' },
    { label: 'Pitch Opportunities', items: p.opportunity, action: 'pitch' },
    { label: 'No Contact on File', items: p.noContact, action: 'cust' },
    { label: 'Stale Visit Notes', items: p.staleVisit, action: 'cust' },
    { label: 'Stock Heads-Up', items: p.stockAlert, action: 'cust' },
  ];
  const nonEmpty = sections.filter(s => s.items.length);

  if (!nonEmpty.length && !p.drafts.length) {
    el.innerHTML = `<div class="cust-empty">${uiIcon('trophy',32)}<div style="margin-top:8px">All caught up! Nothing urgent today.</div></div>`;
    return;
  }

  const row = (item, action) => action === 'pitch'
    ? `<div class="today-row" onclick="pitchToCustomer('${escHtml(item.c.name)}')">
        <div class="today-row-name">${escHtml(item.c.name)}</div>
        <div class="today-row-detail">${escHtml(item.detail)}</div>
      </div>`
    : `<div class="today-row" onclick="openCustModal('${escHtml(item.c.sales)}','${escHtml(item.c.code)}')">
        <div class="today-row-name">${escHtml(item.c.name)}</div>
        <div class="today-row-detail">${escHtml(item.detail)}</div>
      </div>`;

  let html = '';
  if (p.drafts.length) {
    html += `<div class="today-section">
      <div class="today-section-hdr">Unsent Draft Pitches <span class="today-count">${p.drafts.length}</span></div>
      ${p.drafts.map(d => `<div class="today-row" onclick="switchTab('order');openDraftsList();">
        <div class="today-row-name">${escHtml(d.name)}</div>
        <div class="today-row-detail">${escHtml(d.custName||'No customer set')}</div>
      </div>`).join('')}
    </div>`;
  }
  nonEmpty.forEach(s => {
    html += `<div class="today-section">
      <div class="today-section-hdr">${s.label} <span class="today-count">${s.items.length}</span></div>
      ${s.items.map(item => row(item, s.action)).join('')}
    </div>`;
  });
  el.innerHTML = html;
}

function pitchToCustomer(name) {
  switchTab('order');
  const inp = document.getElementById('order-cust');
  inp.value = name;
  onOrderCustInput(name);
}

// ════════════════
// MANAGEMENT RECAP (manager login only)
// ════════════════
function renderManagementRecap() {
  const heroEl = document.getElementById('target-hero');
  const bodyEl = document.getElementById('target-body');
  if (!heroEl || !bodyEl) return;

  const d = getLatestData();
  const mainAreas = d.area_targets.filter(a => !a.area.includes('NAUGHTY NURIS'));
  const nnAreas   = d.area_targets.filter(a =>  a.area.includes('NAUGHTY NURIS'));

  // Company-wide overall % — same NN-exclusion rule as the personal Target
  // hero (renderTarget()), just summed across every rep instead of one.
  let food_target = 0, bev_target = 0, food_ach = 0, bev_ach = 0;
  mainAreas.forEach(a => {
    food_target += a.food_target || 0;
    bev_target  += a.bev_target  || 0;
    food_ach    += a.food_ach    || 0;
    bev_ach     += a.bev_ach     || 0;
  });
  // Nestlé is its own peer target category (alongside Food/Beverage) in the
  // underlying data feed — include it so the headline % matches the sum of
  // both leaderboards shown below, not just the field-sales one.
  const nestleAreas = d.nestle_areas || [];
  let nestle_target = 0, nestle_ach = 0;
  nestleAreas.forEach(n => {
    nestle_target += n.target || 0;
    nestle_ach    += n.achievement || 0;
  });
  // Naughty Nuris — shown as its own line (same as a regular rep who owns an
  // NN area) but excluded from the main Overall %, per house rule.
  let nn_target = 0, nn_ach = 0;
  nnAreas.forEach(a => {
    nn_target += a.food_target || 0;
    nn_ach    += a.food_ach    || 0;
  });
  const main_target = food_target + bev_target + nestle_target;
  const main_ach = food_ach + bev_ach + nestle_ach;
  const overall_pct = main_target > 0 ? Math.round((main_ach / main_target) * 100) : 0;
  const gap80  = Math.max(0, main_target * 0.80 - main_ach);
  const gap100 = Math.max(0, main_target - main_ach);
  const gap80c  = gapCell(gap80, main_target, 'Milestone reached!', 'var(--gold)');
  const gap100c = gapCell(gap100, main_target, 'Target achieved!', 'var(--red)');
  const tagCls = pctTag(overall_pct);
  const _tf = Math.floor(timeFactor());
  const tagLabel = overall_pct >= 100 ? paceIcon('hit')+'Target Hit!' : overall_pct >= _tf ? paceIcon('pace')+'On Pace' : overall_pct >= _tf * 0.7 ? paceIcon('up')+'Getting There' : paceIcon('bolt')+'Push Harder';

  // Mini breakdown cards: Food / Beverage / Nestlé / N. Nuris
  let miniCardsHtml = '';
  if (food_target > 0) miniCardsHtml +=
    '<div class="th-mini"><div class="th-mini-label">Food</div>' +
    '<div class="th-mini-val">' + fmtShort(food_ach) + '</div>' +
    '<div class="th-mini-pct" style="color:' + pctColorOnDark(Math.round(food_ach/food_target*100)) + '">' + Math.round(food_ach/food_target*100) + '%</div></div>';
  if (bev_target > 0) miniCardsHtml +=
    '<div class="th-mini"><div class="th-mini-label">Beverage</div>' +
    '<div class="th-mini-val">' + fmtShort(bev_ach) + '</div>' +
    '<div class="th-mini-pct" style="color:' + pctColorOnDark(Math.round(bev_ach/bev_target*100)) + '">' + Math.round(bev_ach/bev_target*100) + '%</div></div>';
  if (nestle_target > 0) miniCardsHtml +=
    '<div class="th-mini"><div class="th-mini-label">Nestlé</div>' +
    '<div class="th-mini-val">' + fmtShort(nestle_ach) + '</div>' +
    '<div class="th-mini-pct" style="color:' + pctColorOnDark(Math.round(nestle_ach/nestle_target*100)) + '">' + Math.round(nestle_ach/nestle_target*100) + '%</div></div>';
  if (nn_target > 0) miniCardsHtml +=
    '<div class="th-mini"><div class="th-mini-label">N. Nuris</div>' +
    '<div class="th-mini-val">' + fmtShort(nn_ach) + '</div>' +
    '<div class="th-mini-pct" style="color:' + pctColorOnDark(Math.round(nn_ach/nn_target*100)) + '">' + Math.round(nn_ach/nn_target*100) + '%</div></div>';

  // Data freshness
  const _dataAge = Math.round((new Date() - new Date(RAW.latest + 'T00:00:00')) / 86400000);
  const _freshColor = _dataAge === 0 ? 'var(--green)' : _dataAge === 1 ? 'var(--gold)' : 'var(--red)';
  const _freshLabel = _dataAge === 0 ? '● Live' : _dataAge === 1 ? '● 1d ago' : `● ${_dataAge}d ago`;

  // Monthly achievement trend (last 4 months) — company-wide totals per month
  const _allDates = RAW.dates || [];
  const _byMonth = {};
  _allDates.forEach(dt => { _byMonth[dt.slice(0,7)] = dt; });
  const _trendItems = Object.entries(_byMonth).slice(-4).map(([, dt]) => {
    const _da = RAW.targets_by_date[dt];
    if (!_da) return null;
    const _mainA = (_da.area_targets||[]).filter(a => !a.area.includes('NAUGHTY NURIS'));
    let _ft=0,_bt=0,_fa=0,_ba=0;
    _mainA.forEach(a => { _ft+=a.food_target||0; _bt+=a.bev_target||0; _fa+=a.food_ach||0; _ba+=a.bev_ach||0; });
    let _nt=0,_na=0;
    (_da.nestle_areas||[]).forEach(n => { _nt+=n.target||0; _na+=n.achievement||0; });
    const _mt = _ft+_bt+_nt, _ma = _fa+_ba+_na;
    if (_mt <= 0) return null;
    const _ap = Math.round(_ma/_mt*100);
    return `<div class="th-trend-item" style="color:${pctColor(_ap)}">${dt.slice(5,7)}/${dt.slice(2,4)}<br><b>${_ap}%</b></div>`;
  }).filter(Boolean);
  const _trendHtml = _trendItems.length > 1
    ? `<div class="th-trend">${_trendItems.join('<div class="th-trend-sep">→</div>')}</div>`
    : '';

  const leaderRow = (a, i) => {
    // Open territory with no rep assigned yet — not a real person's performance,
    // so don't rank-color or pace-color it like an underperforming rep.
    if (a.sales === 'VACANT') return `<div class="ac-row" style="opacity:0.55">
      <div class="ac-rank">${i+1}</div>
      ${avatarHtml('?', 'var(--txt3)', 26)}
      <div style="flex:1;min-width:0">
        <div class="ac-name">Unassigned</div>
        <div class="ac-area">${escHtml(a.area)} · Open territory</div>
      </div>
      <div class="ac-bar-wrap"><div class="ac-bar" style="width:${Math.min(a.pct,100)}%;background:var(--txt3)"></div></div>
      <div class="ac-pct" style="color:var(--txt3)">${a.pct}%</div>
    </div>`;
    return `<div class="ac-row">
    <div class="ac-rank" style="${i<3?'color:var(--gold);font-weight:700':''}">${i+1}</div>
    ${avatarHtml(a.sales, repColorByName(a.sales), 26)}
    <div style="flex:1;min-width:0">
      <div class="ac-name">${escHtml(a.sales)}</div>
      <div class="ac-area">${escHtml(a.area)}</div>
    </div>
    <div class="ac-bar-wrap"><div class="ac-bar" style="width:${Math.min(a.pct,100)}%;background:${pctColor(a.pct)}"></div></div>
    <div class="ac-pct" style="color:${pctColor(a.pct)}">${a.pct}%</div>
  </div>`;
  };

  // Naughty Nuris sub-row, nested under its owning rep's row — same visual
  // pattern as the regular-rep Area Leaderboard (renderTarget(), ~line 1520).
  const nnSubRow = (a) => {
    const nnRow = nnAreas.find(n => n.sales === a.sales);
    if (!nnRow) return '';
    return `<div class="ac-row nn-subrow">
      <div class="ac-rank" style="color:var(--txt3);font-size:.65rem">↳</div>
      <div>
        <div class="ac-name" style="font-size:.75rem;color:var(--txt2)">${escHtml(nnRow.area)}</div>
        <div class="ac-area">Naughty Nuris</div>
      </div>
      <div class="ac-bar-wrap"><div class="ac-bar" style="width:${Math.min(nnRow.pct,100)}%;background:${pctColor(nnRow.pct)}"></div></div>
      <div class="ac-pct" style="color:${pctColor(nnRow.pct)};font-size:.75rem">${nnRow.pct}%</div>
    </div>`;
  };

  const team = [...mainAreas].sort((a,b) => b.pct - a.pct);
  const teamHtml = team.map((a, i) => leaderRow(a, i) + nnSubRow(a)).join('');
  const nestle = [...(d.nestle_areas||[])].sort((a,b) => b.pct - a.pct);

  heroEl.innerHTML = `
    <div class="target-hero-grid"></div>
    <div class="th-month">${escHtml(RAW.month)} · <span style="color:${_freshColor};font-size:.65rem">${_freshLabel}</span></div>
    <div class="th-rep">Company Overview</div>
    <div class="th-overall">
      <div>
        <div class="th-pct" style="color:${pctColorOnDark(overall_pct)}">${overall_pct}%</div>
        <div class="th-pct-label">Overall</div>
      </div>
      <div>
        <div class="th-status-tag ${tagCls}">${tagLabel}</div>
        <div style="color:rgba(255,255,255,0.35);font-size:.68rem;margin-top:6px">${fmtShort(main_ach)} of ${fmtShort(main_target)}</div>
      </div>
    </div>
    <div class="th-mini-grid">${miniCardsHtml}</div>
    ${_trendHtml}`;

  // Visual milestone progress bars — Food / Beverage / Nestlé / N. Nuris
  const _bars = [];
  if (food_target > 0)   _bars.push({ label:'Food',          ach:food_ach,   tgt:food_target,   color:'#AD1F28' });
  if (bev_target > 0)    _bars.push({ label:'Beverage',      ach:bev_ach,    tgt:bev_target,    color:'#0F2E5C' });
  if (nestle_target > 0) _bars.push({ label:'Nestlé',        ach:nestle_ach, tgt:nestle_target, color:'#1A7A45' });
  if (nn_target > 0)     _bars.push({ label:'Naughty Nuris', ach:nn_ach,     tgt:nn_target,     color:'#B07D1A' });
  let milestoneHtml = `<div class="milestone-card">
    <div class="mc-title">Progress to Milestones</div>
    <div class="mc-bars">`;
  _bars.forEach(b => {
    const pct = b.tgt > 0 ? Math.min(100, (b.ach / b.tgt * 100)) : 0;
    milestoneHtml += `<div class="mc-bar-row">
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
  milestoneHtml += `</div></div>`;

  bodyEl.innerHTML = milestoneHtml + `
    <div class="gap-card">
      <div class="gc-title">How Much More to Go</div>
      <div class="gc-grid">
        <div class="gc-item">
          <div class="gc-label">To reach 80%</div>
          <div class="gc-val" style="color:${gap80c.color}">${gap80c.val}</div>
          <div class="gc-sub">${gap80c.sub}</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">Daily rate to 80%</div>
          <div class="gc-val" style="color:var(--gold)">${gapRate(gap80, main_target)}</div>
          <div class="gc-sub">per day needed</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">To reach 100%</div>
          <div class="gc-val" style="color:${gap100c.color}">${gap100c.val}</div>
          <div class="gc-sub">${gap100c.sub}</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">Daily rate to 100%</div>
          <div class="gc-val" style="color:var(--red)">${daysLeft()>0?fmtShort(gap100/daysLeft()):'—'}</div>
          <div class="gc-sub">per day needed</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">Days remaining</div>
          <div class="gc-val">~${daysLeft()}</div>
          <div class="gc-sub">in ${escHtml(RAW.month)}</div>
          ${_tf > 0 ? `<div class="gc-sub" style="color:${pctColor(Math.round(overall_pct/_tf*100))}">proj. ~${Math.round(overall_pct/_tf*100)}% (${fmtShort(main_ach*100/_tf)})</div>` : ''}
        </div>
      </div>
    </div>
    <div class="area-card">
      <div class="ac-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        Team Leaderboard
        <span style="display:flex;gap:8px">
          <button class="of-draft" style="width:32px;height:32px;padding:7px" onclick="openResetPinPanel()" title="Reset a rep's PIN">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
          </button>
          <button class="of-draft" style="width:32px;height:32px;padding:7px" onclick="exportLeaderboardXlsx()" title="Export to Excel">${uiIcon('download',16)}</button>
        </span>
      </div>
      ${teamHtml}
    </div>
    ${nestle.length ? `<div class="area-card">
      <div class="ac-title">Nestlé Team Leaderboard</div>
      ${nestle.map(leaderRow).join('')}
    </div>` : ''}
  `;

  const _fjAllLines = getFJData(null, false);
  bodyEl.innerHTML += buildTomorrowDeliveryByRepHtml(_fjAllLines);
  bodyEl.innerHTML += buildUnfulfilledByRepHtml(_fjAllLines);

  // Stashed for exportLeaderboardXlsx() — avoids recomputing the ~30 lines
  // of Food/Bev/Nestlé aggregation above just to export the same rows.
  _lastLeaderboardRows = { team, nestle };
}
let _lastLeaderboardRows = { team: [], nestle: [] };

// ════════════════
// EXCEL EXPORT
// ════════════════
// All four screens below reuse the same already-loaded SheetJS build
// (xlsx.full.min.js, lazy-loaded in index.html's _loadFJAll() for reading
// FJ delivery Excel files) — it supports writing too, so no new dependency.
// XLSX may not be ready yet (or may never arrive if the rep is offline when
// that CDN script fails), so every export waits on it with a timeout rather
// than assuming it's there.
async function _exportRows(rows, filenamePrefix) {
  if (!rows.length) { showToast('Nothing to export'); return; }
  const ready = await waitForGlobalTimeout('XLSX', 4000);
  if (!ready) { showToast("Can't export — try again once connected"); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${filenamePrefix}-${new Date().toISOString().slice(0,10)}.xlsx`);
}

function exportCustomersXlsx() {
  if (!(currentRep?.isManager || currentRep?.isSuperAdmin)) { showToast('Managers only'); return; }
  let custs = getRepCustomerList();
  if (_custGroup === 'INACTIVE') custs = custs.filter(c => monthsSinceLastOrder(c) >= 2);
  else if (_custGroup !== 'all') custs = custs.filter(c => (c.group||'').toUpperCase() === _custGroup.toUpperCase());
  if (_custQuery) custs = custs.filter(c =>
    (c.name||'').toLowerCase().includes(_custQuery) || (c.area||'').toLowerCase().includes(_custQuery));
  const rows = custs.map(c => ({
    Customer: c.name, Area: c.area||'', Group: c.group||'',
    ...(currentRep?.isManager || currentRep?.isSuperAdmin ? { Rep: c.sales||'' } : {}),
    'Total Revenue': c.total||0,
    'Last Order': MONTH_SHORT[c.last_month] || c.last_month || '',
    'Growth %': getGrowth(c.monthly) ?? '',
  }));
  _exportRows(rows, 'customers');
}

function exportLeaderboardXlsx() {
  if (!(currentRep?.isManager || currentRep?.isSuperAdmin)) { showToast('Managers only'); return; }
  const rows = [
    ..._lastLeaderboardRows.team.map(a => ({
      Area: a.area, Rep: a.sales, 'Achievement %': a.pct,
      'Food Target': a.food_target||0, 'Food Achieved': a.food_ach||0,
      'Beverage Target': a.bev_target||0, 'Beverage Achieved': a.bev_ach||0,
    })),
    ..._lastLeaderboardRows.nestle.map(n => ({
      Area: n.area, Rep: n.sales, 'Achievement %': n.pct,
      Target: n.target||0, Achieved: n.achievement||0, Team: 'Nestlé',
    })),
  ];
  _exportRows(rows, 'leaderboard');
}

function exportIntelXlsx() {
  if (!(currentRep?.isManager || currentRep?.isSuperAdmin)) { showToast('Managers only'); return; }
  const rows = _filteredIntelLogs().map(r => ({
    Competitor: r.competitor_name, Product: r.product, Category: r.category||'',
    Price: r.price, Unit: r.unit, Customer: r.customer_name||'', Notes: r.notes||'',
    Rep: r.reps ? r.reps.name : '', Date: new Date(r.created_at).toISOString().slice(0,10),
  }));
  _exportRows(rows, 'intel');
}

// ════════════════
// TARGET SCREEN
// ════════════════
// ── BADGE SYSTEM ──
function getBadges(repName, d, aliases) {
  const badges = [];

  // Get all areas for this rep (main only, no NN)
  const myAreas = d.area_targets.filter(a =>
    salesNameMatches(a.sales, repName, aliases) && !a.area.includes('NAUGHTY NURIS')
  );

  // Nestlé rep — check nestle_areas
  const nestleEntry = d.nestle_areas.find(n => salesNameMatches(n.sales, repName, aliases));

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

  // On Target — 80%+
  if (pct >= 80) badges.push({ icon: 'target', name: 'On Target', desc: 'Reached 80% of target' });

  // Full Target — 100%+
  if (pct >= 100) badges.push({ icon: 'trophy', name: 'Full Target', desc: 'Hit 100% of target!' });

  // Overachiever — 110%+
  if (pct >= 110) badges.push({ icon: 'gem', name: 'Overachiever', desc: 'Exceeded 110% — outstanding!' });

  // Area King — #1 in leaderboard
  const mainAreas = d.area_targets.filter(a => !a.area.includes('NAUGHTY NURIS'));
  const sorted = [...mainAreas].sort((a,b) => b.pct - a.pct);
  if (sorted.length > 0 && salesNameMatches(sorted[0].sales, repName, aliases)) {
    badges.push({ icon: 'crown', name: 'Area King', desc: 'Top of the leaderboard this month!' });
  }

  return badges;
}

function getBadgeIcons(repName, d, aliases) {
  return getBadges(repName, d, aliases).map(b => uiIcon(b.icon, 13)).join('');
}

// ── REP TYPE HELPERS ──
// 'Redi' can't log in directly anymore (his REP_CONFIG display name is now
// 'Vacant'), but View As temporarily swaps currentRep.name to his real name
// for data lookups — keep him here so that swapped render routes correctly.
const NESTLE_REPS  = ['Ridwan','Redi','Gek Mas'];
const NN_REPS      = { 'I Made Luih': 'NAUGHTY NURIS (SANUR)', 'Sujana': 'NAUGHTY NURIS (SEMINYAK)' };

function isNestleRep(name)  { return NESTLE_REPS.includes(name); }
function hasNNArea(name)    { return !!NN_REPS[name]; }

// Maps a raw feed/db name (e.g. 'Redi') back to its current REP_CONFIG
// display name (e.g. 'Vacant') — the feed still uses old rep names for
// territories that have since gone unstaffed; only the display should say so.
function feedDisplayName(feedName) {
  const cfg = REP_CONFIG.find(r => r.dbName === feedName);
  return cfg ? cfg.name : feedName;
}

function renderTarget() {
  if (!currentRep) return;

  // ── MANAGER: company-wide overview instead of a personal hero ──
  if (currentRep.isManager) { renderManagementRecap(); return; }

  // ── BISDEV: company-wide, single-category (Food or Beverage) overview ──
  if (currentRep.bisdevCategory) { renderBisdevTarget(currentRep.bisdevCategory); return; }

  // ── NESTLE COORDINATOR: whole Nestlé team overview ──
  if (currentRep.isNestleCoordinator) { renderNestleCoordinatorTarget(); return; }

  // ── SUPER ADMIN: pick any profile to view it live ──
  if (currentRep.isSuperAdmin) { renderSuperAdminPanel(); return; }

  const d = getLatestData();
  const repName = currentRep.name;
  const repAliases = currentRep.aliases;

  // ── NESTLÉ REPS: show only Nestlé data ──
  if (isNestleRep(repName)) {
    renderNestleTarget(d, repName);
    return;
  }

  // ── REGULAR REPS: find their areas (exclude Naughty Nuris) ──
  const myMainAreas = d.area_targets.filter(a =>
    salesNameMatches(a.sales, repName, repAliases) && !a.area.includes('NAUGHTY NURIS')
  );

  // Naughty Nuris area for this rep (if any)
  const myNNArea = d.area_targets.find(a =>
    salesNameMatches(a.sales, repName, repAliases) && a.area.includes('NAUGHTY NURIS')
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
  const gap80c  = gapCell(gap80, main_target, 'Milestone reached!', 'var(--gold)');
  const gap100c = gapCell(gap100, main_target, 'Target achieved!', 'var(--red)');
  const tagCls = pctTag(overall_pct);
  const _tf = Math.floor(timeFactor());
  const tagLabel = overall_pct >= 100 ? paceIcon('hit')+'Target Hit!' : overall_pct >= _tf ? paceIcon('pace')+'On Pace' : overall_pct >= _tf * 0.7 ? paceIcon('up')+'Getting There' : paceIcon('bolt')+'Push Harder';

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
        '<div class="th-mini-pct" style="color:' + pctColorOnDark(ap) + '">' + ap + '%</div>' +
        '</div>';
    });
  } else {
    if (food_target > 0) miniCardsHtml +=
      '<div class="th-mini"><div class="th-mini-label">Food</div>' +
      '<div class="th-mini-val">' + fmtShort(food_ach) + '</div>' +
      '<div class="th-mini-pct" style="color:' + pctColorOnDark(Math.round(food_ach/food_target*100)) + '">' + Math.round(food_ach/food_target*100) + '%</div></div>';
    if (bev_target > 0) miniCardsHtml +=
      '<div class="th-mini"><div class="th-mini-label">Beverage</div>' +
      '<div class="th-mini-val">' + fmtShort(bev_ach) + '</div>' +
      '<div class="th-mini-pct" style="color:' + pctColorOnDark(Math.round(bev_ach/bev_target*100)) + '">' + Math.round(bev_ach/bev_target*100) + '%</div></div>';
  }
  // Always show NN mini card if rep has Naughty Nuris
  if (nn_target > 0) miniCardsHtml +=
    '<div class="th-mini"><div class="th-mini-label">N. Nuris</div>' +
    '<div class="th-mini-val">' + fmtShort(nn_ach) + '</div>' +
    '<div class="th-mini-pct" style="color:' + pctColorOnDark(Math.round(nn_ach/nn_target*100)) + '">' + Math.round(nn_ach/nn_target*100) + '%</div></div>';

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
    const _ar = (_da.area_targets||[]).filter(a => salesNameMatches(a.sales, repName, repAliases) && !a.area.includes('NAUGHTY NURIS'));
    if (!_ar.length) return null;
    const _ap = _ar[0].pct;
    return `<div class="th-trend-item" style="color:${pctColor(_ap)}">${dt.slice(5,7)}/${dt.slice(2,4)}<br><b>${_ap}%</b></div>`;
  }).filter(Boolean);
  const _trendHtml = _trendItems.length > 1
    ? `<div class="th-trend">${_trendItems.join('<div class="th-trend-sep">→</div>')}</div>`
    : '';

  // Hero
  document.getElementById('target-hero').innerHTML = `
    <div class="target-hero-grid"></div>
    <div class="th-month">${RAW.month} · <span style="color:${_freshColor};font-size:.65rem">${_freshLabel}</span></div>
    <div class="th-rep">${repName}</div>
    <div class="th-overall">
      <div>
        <div class="th-pct" style="color:${pctColorOnDark(overall_pct)}">${overall_pct}%</div>
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
    const areaColors = ['#AD1F28','#0F2E5C','#1A7A45','#B07D1A'];
    myMainAreas.forEach((a, i) => {
      const at = (a.food_target||0) + (a.bev_target||0);
      const aa = (a.food_ach||0)   + (a.bev_ach||0);
      if (at > 0) bars.push({ label: a.area.replace('KUTA - ','').replace('KUTA SEL - ',''), ach: aa, tgt: at, color: areaColors[i % areaColors.length] });
    });
  } else {
    if (food_target > 0)  bars.push({ label:'Food',     ach:food_ach, tgt:food_target, color:'#AD1F28' });
    if (bev_target > 0)   bars.push({ label:'Beverage', ach:bev_ach,  tgt:bev_target,  color:'#0F2E5C' });
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
      const g80c  = gapCell(g80, at, 'Milestone reached!', 'var(--gold)');
      const g100c = gapCell(g100, at, 'Target achieved!', 'var(--red)');
      const aLabel = a.area.replace('KUTA - ','').replace('KUTA SEL - ','');
      bodyHtml += '<div class="gc-area-label">' + aLabel + '</div>' +
        '<div class="gc-grid">' +
        '<div class="gc-item"><div class="gc-label">To reach 80%</div>' +
        '<div class="gc-val" style="color:' + g80c.color + '">' + g80c.val + '</div>' +
        '<div class="gc-sub">' + g80c.sub + '</div></div>' +
        '<div class="gc-item"><div class="gc-label">Daily rate to 80%</div>' +
        '<div class="gc-val" style="color:var(--gold)">' + gapRate(g80, at) + '</div>' +
        '<div class="gc-sub">per day needed</div></div>' +
        '<div class="gc-item"><div class="gc-label">To reach 100%</div>' +
        '<div class="gc-val" style="color:' + g100c.color + '">' + g100c.val + '</div>' +
        '<div class="gc-sub">' + g100c.sub + '</div></div>' +
        '<div class="gc-item"><div class="gc-label">Daily rate to 100%</div>' +
        '<div class="gc-val" style="color:var(--red)">' + (daysLeft()>0?fmtShort(g100/daysLeft()):'—') + '</div>' +
        '<div class="gc-sub">per day needed</div></div>' +
        '<div class="gc-item"><div class="gc-label">Days remaining</div>' +
        '<div class="gc-val">~' + daysLeft() + '</div>' +
        '<div class="gc-sub">in ' + RAW.month + '</div>' +
        (at > 0 && _tf > 0 ? '<div class="gc-sub" style="color:' + pctColor(Math.round(aa/at*100/_tf*100)) + '">proj. ~' + Math.round(aa/at*100/_tf*100) + '% (' + fmtShort(aa*100/_tf) + ')</div>' : '') +
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
        <div class="gc-val" style="color:${gap80c.color}">${gap80c.val}</div>
        <div class="gc-sub">${gap80c.sub}</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">Daily rate to 80%</div>
        <div class="gc-val" style="color:var(--gold)">${gapRate(gap80, main_target)}</div>
        <div class="gc-sub">per day needed</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">To reach 100%</div>
        <div class="gc-val" style="color:${gap100c.color}">${gap100c.val}</div>
        <div class="gc-sub">${gap100c.sub}</div>
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
        ${_tf > 0 ? `<div class="gc-sub" style="color:${pctColor(Math.round(overall_pct/_tf*100))}">proj. ~${Math.round(overall_pct/_tf*100)}% (${fmtShort(main_ach*100/_tf)})</div>` : ''}
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

    const meStyle = isMe ? 'background:var(--red-l);border-radius:8px;padding:8px 6px;margin:-2px -4px;' : '';
    const rowBadges = getBadgeIcons(a.sales, d);
    const _pr = _prevRankMap[a.sales];
    const _rd = _pr ? _pr - rank : null;
    const _rankChg = _rd > 0 ? `<span style="color:var(--green);font-size:.6rem;font-weight:700">↑${_rd}</span>`
      : _rd < 0 ? `<span style="color:var(--red);font-size:.6rem;font-weight:700">↓${Math.abs(_rd)}</span>` : '';
    lbHtml += `<div class="ac-row" style="${meStyle}">
      <div class="ac-rank" style="${rank<=3?'color:var(--gold);font-weight:700':''}">${rank}${_rankChg}</div>
      ${avatarHtml(a.sales, repColorByName(a.sales), 26)}
      <div style="flex:1;min-width:0">
        <div class="ac-name">${a.sales}${isMe?' <span class="ac-you">You</span>':''}${rowBadges ? ' <span class="ac-badges">'+rowBadges+'</span>' : ''}</div>
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
  const myBadges = getBadges(repName, d, repAliases);
  if (myBadges.length > 0) {
    bodyHtml += '<div class="badges-card">' +
      '<div class="gc-title">Your Badges This Month</div>' +
      '<div class="badges-grid">' +
      myBadges.map(b =>
        '<div class="badge-item">' +
          '<div class="badge-icon">' + uiIcon(b.icon, 26) + '</div>' +
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
  bodyHtml += buildTodaySOHtml(getTodaySO(repName, repAliases));
  const _fjLines = getFJData(repName, false, repAliases);
  bodyHtml += buildTomorrowDeliveryHtml(_fjLines);
  bodyHtml += buildUnfulfilledHtml(_fjLines);

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
  const gap80c  = gapCell(gap80, tgt, 'Milestone reached!', 'var(--gold)');
  const gap100c = gapCell(gap100, tgt, 'Target achieved!', 'var(--red)');
  const tagCls = pctTag(pct);
  const _tf2 = Math.floor(timeFactor());
  const tagLabel = pct >= 100 ? paceIcon('hit')+'Target Hit!' : pct >= _tf2 ? paceIcon('pace')+'On Pace' : pct >= _tf2 * 0.7 ? paceIcon('up')+'Getting There' : paceIcon('bolt')+'Push Harder';

  const _dataAge2 = Math.round((new Date() - new Date(RAW.latest + 'T00:00:00')) / 86400000);
  const _freshColor2 = _dataAge2 === 0 ? 'var(--green)' : _dataAge2 === 1 ? 'var(--gold)' : 'var(--red)';
  const _freshLabel2 = _dataAge2 === 0 ? '● Live' : _dataAge2 === 1 ? '● 1d ago' : `● ${_dataAge2}d ago`;

  document.getElementById('target-hero').innerHTML = `
    <div class="target-hero-grid"></div>
    <div class="th-month">${RAW.month} · <span style="color:${_freshColor2};font-size:.65rem">${_freshLabel2}</span></div>
    <div class="th-rep">${escHtml(feedDisplayName(repName))}</div>
    <div class="th-overall">
      <div>
        <div class="th-pct" style="color:${pctColorOnDark(pct)}">${pct}%</div>
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
        <div class="th-mini-pct" style="color:${pctColorOnDark(pct)}">${pct}%</div>
      </div>
      <div class="th-mini">
        <div class="th-mini-label">Target</div>
        <div class="th-mini-val">${fmtShort(tgt)}</div>
        <div class="th-mini-pct" style="color:var(--green-onDark)">100%</div>
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
        <div class="gc-val" style="color:${gap80c.color}">${gap80c.val}</div>
        <div class="gc-sub">${gap80c.sub}</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">Daily rate to 80%</div>
        <div class="gc-val" style="color:var(--gold)">${gapRate(gap80, tgt)}</div>
        <div class="gc-sub">per day needed</div>
      </div>
      <div class="gc-item">
        <div class="gc-label">To reach 100%</div>
        <div class="gc-val" style="color:${gap100c.color}">${gap100c.val}</div>
        <div class="gc-sub">${gap100c.sub}</div>
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
        ${_tf2 > 0 ? `<div class="gc-sub" style="color:${pctColor(Math.round(pct/_tf2*100))}">proj. ~${Math.round(pct/_tf2*100)}% (${fmtShort(ach*100/_tf2)})</div>` : ''}
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
      const _dname = feedDisplayName(n.sales);
      return `<div class="ac-row" style="${isMe?'background:var(--red-l);border-radius:8px;padding:8px 6px;margin:-2px -4px;':''}">
        <div class="ac-rank" style="${i<3?'color:var(--gold);font-weight:700':''}">${i+1}</div>
        ${avatarHtml(_dname, repColorByName(_dname), 26)}
        <div style="flex:1;min-width:0">
          <div class="ac-name">${escHtml(_dname)}${isMe?' <span class="ac-you">You</span>':''}${nb?' <span class="ac-badges">'+nb+'</span>':''}</div>
          <div class="ac-area">${n.area}</div>
        </div>
        <div class="ac-bar-wrap"><div class="ac-bar" style="width:${Math.min(n.pct,100)}%;background:${pctColor(n.pct)}"></div></div>
        <div class="ac-pct" style="color:${pctColor(n.pct)}">${n.pct}%</div>
      </div>`;
    }).join('')}
  </div>`;

  // Today's orders
  bodyHtml += buildTodaySOHtml(getTodaySO(repName, currentRep?.aliases));
  const _fjLines = getFJData(repName, false, currentRep?.aliases);
  bodyHtml += buildTomorrowDeliveryHtml(_fjLines);
  bodyHtml += buildUnfulfilledHtml(_fjLines);

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
  // Every call site already guards with `daysLeft()>0 ? ... : '—'` before
  // using this as a division denominator, so a real 0 here is safe — no
  // artificial floor needed, and flooring it produced a misleading "~1 day
  // remaining" on the actual last working day of the month.
  return count;
}

// Bisdev: company-wide, single-category (Food-only or Beverage-only) view —
// a leaner sibling of renderManagementRecap() for the two Bisdev logins.
// Takes explicit container ids so the same aggregation can render into
// either the Target tab (default) or the auto-opened Bisdev popup.
function renderBisdevTarget(category, heroElId, bodyElId) {
  const heroEl = document.getElementById(heroElId || 'target-hero');
  const bodyEl = document.getElementById(bodyElId || 'target-body');
  if (!heroEl || !bodyEl) return;

  const d = getLatestData();
  const mainAreas = d.area_targets.filter(a => !a.area.includes('NAUGHTY NURIS'));
  const targetKey = category === 'food' ? 'food_target' : 'bev_target';
  const achKey    = category === 'food' ? 'food_ach'    : 'bev_ach';
  const label     = category === 'food' ? 'Food' : 'Beverage';
  const barColor  = category === 'food' ? '#AD1F28' : '#0F2E5C';

  let target = 0, ach = 0;
  mainAreas.forEach(a => {
    target += a[targetKey] || 0;
    ach    += a[achKey] || 0;
  });
  const overall_pct = target > 0 ? Math.round((ach / target) * 100) : 0;
  const gap80  = Math.max(0, target * 0.80 - ach);
  const gap100 = Math.max(0, target - ach);
  const gap80c  = gapCell(gap80, target, 'Milestone reached!', 'var(--gold)');
  const gap100c = gapCell(gap100, target, 'Target achieved!', 'var(--red)');
  const tagCls = pctTag(overall_pct);
  const _tf = Math.floor(timeFactor());
  const tagLabel = overall_pct >= 100 ? paceIcon('hit')+'Target Hit!' : overall_pct >= _tf ? paceIcon('pace')+'On Pace' : overall_pct >= _tf * 0.7 ? paceIcon('up')+'Getting There' : paceIcon('bolt')+'Push Harder';

  const _dataAge = Math.round((new Date() - new Date(RAW.latest + 'T00:00:00')) / 86400000);
  const _freshColor = _dataAge === 0 ? 'var(--green)' : _dataAge === 1 ? 'var(--gold)' : 'var(--red)';
  const _freshLabel = _dataAge === 0 ? '● Live' : _dataAge === 1 ? '● 1d ago' : `● ${_dataAge}d ago`;

  heroEl.innerHTML = `
    <div class="target-hero-grid"></div>
    <div class="th-month">${escHtml(RAW.month)} · <span style="color:${_freshColor};font-size:.65rem">${_freshLabel}</span></div>
    <div class="th-rep">${label} — Company Overview</div>
    <div class="th-overall">
      <div>
        <div class="th-pct" style="color:${pctColorOnDark(overall_pct)}">${overall_pct}%</div>
        <div class="th-pct-label">Overall</div>
      </div>
      <div>
        <div class="th-status-tag ${tagCls}">${tagLabel}</div>
        <div style="color:rgba(255,255,255,0.35);font-size:.68rem;margin-top:6px">${fmtShort(ach)} of ${fmtShort(target)}</div>
      </div>
    </div>`;

  const barPct = target > 0 ? Math.min(100, (ach / target * 100)) : 0;
  const milestoneHtml = `<div class="milestone-card">
    <div class="mc-title">Progress to Milestone</div>
    <div class="mc-bars">
      <div class="mc-bar-row">
        <div class="mc-bar-top">
          <div class="mc-bar-label">${label}</div>
          <div class="mc-bar-nums">${fmtShort(ach)} / ${fmtShort(target)}</div>
        </div>
        <div class="mc-bar-bg">
          <div class="mc-bar-fill" style="width:${barPct}%;background:${barColor}"></div>
        </div>
        <div class="mc-markers">
          <div class="mc-mark" style="left:80%"><div class="mc-mark-line"></div><div class="mc-mark-label">80%</div></div>
          <div class="mc-mark" style="left:99%"><div class="mc-mark-line"></div><div class="mc-mark-label">100%</div></div>
        </div>
      </div>
    </div>
  </div>`;

  // Single-category pct per area — NOT the row's combined `a.pct`, which
  // mixes food+bev. Sort and color the leaderboard by this category alone.
  const catPct = a => (a[targetKey] > 0 ? Math.round((a[achKey] / a[targetKey]) * 100) : 0);
  const bisdevLeaderRow = (a, i) => {
    const pct = catPct(a);
    if (a.sales === 'VACANT') return `<div class="ac-row" style="opacity:0.55">
      <div class="ac-rank">${i+1}</div>
      ${avatarHtml('?', 'var(--txt3)', 26)}
      <div style="flex:1;min-width:0">
        <div class="ac-name">Unassigned</div>
        <div class="ac-area">${escHtml(a.area)} · Open territory</div>
      </div>
      <div class="ac-bar-wrap"><div class="ac-bar" style="width:${Math.min(pct,100)}%;background:var(--txt3)"></div></div>
      <div class="ac-pct" style="color:var(--txt3)">${pct}%</div>
    </div>`;
    return `<div class="ac-row">
    <div class="ac-rank" style="${i<3?'color:var(--gold);font-weight:700':''}">${i+1}</div>
    ${avatarHtml(a.sales, repColorByName(a.sales), 26)}
    <div style="flex:1;min-width:0">
      <div class="ac-name">${escHtml(a.sales)}</div>
      <div class="ac-area">${escHtml(a.area)}</div>
    </div>
    <div class="ac-bar-wrap"><div class="ac-bar" style="width:${Math.min(pct,100)}%;background:${pctColor(pct)}"></div></div>
    <div class="ac-pct" style="color:${pctColor(pct)}">${pct}%</div>
  </div>`;
  };

  const team = [...mainAreas].sort((a, b) => catPct(b) - catPct(a));
  const teamHtml = team.map((a, i) => bisdevLeaderRow(a, i)).join('');

  bodyEl.innerHTML = milestoneHtml + `
    <div class="gap-card">
      <div class="gc-title">How Much More to Go</div>
      <div class="gc-grid">
        <div class="gc-item">
          <div class="gc-label">To reach 80%</div>
          <div class="gc-val" style="color:${gap80c.color}">${gap80c.val}</div>
          <div class="gc-sub">${gap80c.sub}</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">Daily rate to 80%</div>
          <div class="gc-val" style="color:var(--gold)">${gapRate(gap80, target)}</div>
          <div class="gc-sub">per day needed</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">To reach 100%</div>
          <div class="gc-val" style="color:${gap100c.color}">${gap100c.val}</div>
          <div class="gc-sub">${gap100c.sub}</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">Daily rate to 100%</div>
          <div class="gc-val" style="color:var(--red)">${daysLeft()>0?fmtShort(gap100/daysLeft()):'—'}</div>
          <div class="gc-sub">per day needed</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">Days remaining</div>
          <div class="gc-val">~${daysLeft()}</div>
          <div class="gc-sub">in ${escHtml(RAW.month)}</div>
          ${_tf > 0 ? `<div class="gc-sub" style="color:${pctColor(Math.round(overall_pct/_tf*100))}">proj. ~${Math.round(overall_pct/_tf*100)}% (${fmtShort(ach*100/_tf)})</div>` : ''}
        </div>
      </div>
    </div>
    <div class="area-card">
      <div class="ac-title">${label} Leaderboard</div>
      ${teamHtml}
    </div>
  `;
}

function openBisdevDashboard(category) {
  document.getElementById('bisdev-title').textContent = (category === 'food' ? 'Food' : 'Beverage') + ' — Company Overview';
  renderBisdevTarget(category, 'bisdev-hero', 'bisdev-body');
  document.getElementById('bisdev-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeBisdevDashboard(e) {
  if (!e || e.target === document.getElementById('bisdev-overlay')) {
    document.getElementById('bisdev-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }
}

// Nestle Coordinator: whole-team Nestlé overview — d.nestle_areas rows
// already carry {sales, area, target, achievement, pct} directly, so unlike
// renderBisdevTarget() there's no per-category key-switching needed.
function renderNestleCoordinatorTarget(heroElId, bodyElId) {
  const heroEl = document.getElementById(heroElId || 'target-hero');
  const bodyEl = document.getElementById(bodyElId || 'target-body');
  if (!heroEl || !bodyEl) return;

  const d = getLatestData();
  const nestleAreas = d.nestle_areas || [];
  let target = 0, ach = 0;
  nestleAreas.forEach(n => {
    target += n.target || 0;
    ach    += n.achievement || 0;
  });
  const overall_pct = target > 0 ? Math.round((ach / target) * 100) : 0;
  const gap80  = Math.max(0, target * 0.80 - ach);
  const gap100 = Math.max(0, target - ach);
  const gap80c  = gapCell(gap80, target, 'Milestone reached!', 'var(--gold)');
  const gap100c = gapCell(gap100, target, 'Target achieved!', 'var(--red)');
  const tagCls = pctTag(overall_pct);
  const _tf = Math.floor(timeFactor());
  const tagLabel = overall_pct >= 100 ? paceIcon('hit')+'Target Hit!' : overall_pct >= _tf ? paceIcon('pace')+'On Pace' : overall_pct >= _tf * 0.7 ? paceIcon('up')+'Getting There' : paceIcon('bolt')+'Push Harder';

  const _dataAge = Math.round((new Date() - new Date(RAW.latest + 'T00:00:00')) / 86400000);
  const _freshColor = _dataAge === 0 ? 'var(--green)' : _dataAge === 1 ? 'var(--gold)' : 'var(--red)';
  const _freshLabel = _dataAge === 0 ? '● Live' : _dataAge === 1 ? '● 1d ago' : `● ${_dataAge}d ago`;

  heroEl.innerHTML = `
    <div class="target-hero-grid"></div>
    <div class="th-month">${escHtml(RAW.month)} · <span style="color:${_freshColor};font-size:.65rem">${_freshLabel}</span></div>
    <div class="th-rep">Nestlé — Team Overview</div>
    <div class="th-overall">
      <div>
        <div class="th-pct" style="color:${pctColorOnDark(overall_pct)}">${overall_pct}%</div>
        <div class="th-pct-label">Overall</div>
      </div>
      <div>
        <div class="th-status-tag ${tagCls}">${tagLabel}</div>
        <div style="color:rgba(255,255,255,0.35);font-size:.68rem;margin-top:6px">${fmtShort(ach)} of ${fmtShort(target)}</div>
      </div>
    </div>`;

  const barPct = target > 0 ? Math.min(100, (ach / target * 100)) : 0;
  const milestoneHtml = `<div class="milestone-card">
    <div class="mc-title">Progress to Milestone</div>
    <div class="mc-bars">
      <div class="mc-bar-row">
        <div class="mc-bar-top">
          <div class="mc-bar-label">Nestlé</div>
          <div class="mc-bar-nums">${fmtShort(ach)} / ${fmtShort(target)}</div>
        </div>
        <div class="mc-bar-bg">
          <div class="mc-bar-fill" style="width:${barPct}%;background:#1A7A45"></div>
        </div>
        <div class="mc-markers">
          <div class="mc-mark" style="left:80%"><div class="mc-mark-line"></div><div class="mc-mark-label">80%</div></div>
          <div class="mc-mark" style="left:99%"><div class="mc-mark-line"></div><div class="mc-mark-label">100%</div></div>
        </div>
      </div>
    </div>
  </div>`;

  const leaderRow = (a, i) => { const _name = feedDisplayName(a.sales); return `<div class="ac-row">
    <div class="ac-rank" style="${i<3?'color:var(--gold);font-weight:700':''}">${i+1}</div>
    ${avatarHtml(_name, repColorByName(_name), 26)}
    <div style="flex:1;min-width:0">
      <div class="ac-name">${escHtml(_name)}</div>
      <div class="ac-area">${escHtml(a.area)}</div>
    </div>
    <div class="ac-bar-wrap"><div class="ac-bar" style="width:${Math.min(a.pct,100)}%;background:${pctColor(a.pct)}"></div></div>
    <div class="ac-pct" style="color:${pctColor(a.pct)}">${a.pct}%</div>
  </div>`; };

  const team = [...nestleAreas].sort((a, b) => b.pct - a.pct);
  const teamHtml = team.map(leaderRow).join('');

  bodyEl.innerHTML = milestoneHtml + `
    <div class="gap-card">
      <div class="gc-title">How Much More to Go</div>
      <div class="gc-grid">
        <div class="gc-item">
          <div class="gc-label">To reach 80%</div>
          <div class="gc-val" style="color:${gap80c.color}">${gap80c.val}</div>
          <div class="gc-sub">${gap80c.sub}</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">Daily rate to 80%</div>
          <div class="gc-val" style="color:var(--gold)">${gapRate(gap80, target)}</div>
          <div class="gc-sub">per day needed</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">To reach 100%</div>
          <div class="gc-val" style="color:${gap100c.color}">${gap100c.val}</div>
          <div class="gc-sub">${gap100c.sub}</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">Daily rate to 100%</div>
          <div class="gc-val" style="color:var(--red)">${daysLeft()>0?fmtShort(gap100/daysLeft()):'—'}</div>
          <div class="gc-sub">per day needed</div>
        </div>
        <div class="gc-item">
          <div class="gc-label">Days remaining</div>
          <div class="gc-val">~${daysLeft()}</div>
          <div class="gc-sub">in ${escHtml(RAW.month)}</div>
          ${_tf > 0 ? `<div class="gc-sub" style="color:${pctColor(Math.round(overall_pct/_tf*100))}">proj. ~${Math.round(overall_pct/_tf*100)}% (${fmtShort(ach*100/_tf)})</div>` : ''}
        </div>
      </div>
    </div>
    <div class="area-card">
      <div class="ac-title">Nestlé Team Leaderboard</div>
      ${teamHtml}
    </div>
  `;
}

// Reuses the same popup DOM as openBisdevDashboard() — one shared
// "company-wide overview" modal for every no-personal-portfolio role
// (Bisdev Food/Beverage, Nestle Coordinator), just with different content.
function openNestleCoordinatorDashboard() {
  document.getElementById('bisdev-title').textContent = 'Nestlé — Team Overview';
  renderNestleCoordinatorTarget('bisdev-hero', 'bisdev-body');
  document.getElementById('bisdev-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// Super Admin landing view: every profile, grouped the same way the login
// screen groups them, each row opening that rep's live app via viewAsRep().
function renderSuperAdminPanel() {
  const heroEl = document.getElementById('target-hero');
  const bodyEl = document.getElementById('target-body');
  if (!heroEl || !bodyEl) return;

  heroEl.innerHTML = `
    <div class="target-hero-grid"></div>
    <div class="th-rep">Super Admin</div>
    <div class="th-overall">
      <div style="color:rgba(255,255,255,0.65);font-size:.8rem;line-height:1.4">
        Pick a profile below to view it live — exactly as that person sees the app.
      </div>
    </div>`;

  bodyEl.innerHTML = groupRepsForAdmin(currentRep.name).map(([label, reps]) => `
    <div class="area-card">
      <div class="ac-title">${label}</div>
      ${reps.map(r => {
        const idx = REP_CONFIG.indexOf(r);
        return `<div class="ac-row" style="cursor:pointer" onclick="viewAsRep(${idx}, this)">
          ${avatarHtml(r.name, COLORS[idx % COLORS.length], 26)}
          <div style="flex:1;min-width:0">
            <div class="ac-name">${escHtml(r.name)}</div>
            <div class="ac-area">${escHtml(r.area)}</div>
          </div>
          <span class="intel-card-actions">
            <button onclick="event.stopPropagation(); resetRepPin(${idx})" title="Reset PIN">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            </button>
            <button onclick="event.stopPropagation(); editRepProfile(${idx})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
          </span>
        </div>`;
      }).join('')}
    </div>
  `).join('');
}

// Shared Field Sales/Nestlé Team/Management grouping — used by the Super
// Admin panel above and the Manager-facing Reset PIN overlay below.
// Excludes the caller's own entry (viewing/resetting "yourself" doesn't
// apply here — self-service PIN change already exists in the profile view).
function groupRepsForAdmin(excludeName) {
  const others = REP_CONFIG.filter(r => r.name !== excludeName);
  return [
    ['Field Sales', others.filter(r => !r.area.includes('Nestlé') && r.div !== 'MGMT')],
    ['Nestlé Team', others.filter(r => r.area.includes('Nestlé'))],
    ['Management',  others.filter(r => r.div === 'MGMT')],
  ];
}

// Reads the target rep's real row (RLS-readable by any authenticated rep,
// per 0001_create_reps.sql) and re-renders under that identity — no
// Supabase Auth sign-in happens, so Super Admin's own session (and write
// attribution) never changes underneath.
function _restoreViewAsNameSwap() {
  if (_viewingAsMutatedIdx === null) return;
  REP_CONFIG[_viewingAsMutatedIdx].name = _viewingAsMutatedOriginalName;
  _viewingAsMutatedIdx = null;
  _viewingAsMutatedOriginalName = null;
}

let _viewAsLoading = false;

async function viewAsRep(idx, rowEl) {
  if (_viewAsLoading) return; // ignore double-clicks/re-entrant taps while one is already loading
  _viewAsLoading = true;
  if (rowEl) rowEl.classList.add('ac-row-loading');
  _restoreViewAsNameSwap(); // undo a previous preview's swap before starting a new one
  const target = REP_CONFIG[idx];
  const lookupName = target.dbName || target.name;
  const displayName = target.name;
  try {
    await waitForGlobal('AppAuth');
    const repRow = await window.AppAuth.fetchRepForViewAs(lookupName);
    if (target.dbName) {
      _viewingAsMutatedIdx = idx;
      _viewingAsMutatedOriginalName = displayName;
      REP_CONFIG[idx].name = target.dbName;
    }
    _suppressAutoPopup = true;
    selectRep(idx, {
      repId: repRow.id, authUserId: repRow.auth_user_id, isManager: repRow.is_manager,
      phone: repRow.phone, photoUrl: repRow.photo_url, bisdevCategory: repRow.bisdev_category,
      isNestleCoordinator: repRow.is_nestle_coordinator, isSuperAdmin: repRow.is_super_admin,
    });
    _suppressAutoPopup = false;
    // Patch the visible labels back to the display name AFTER selectRep()
    // (and everything it rendered — Target/Today/Customers) already used
    // the real underlying name for its data lookups. Only needed when a
    // dbName swap actually happened — for everyone else target-hero
    // legitimately shows something other than a personal name (e.g.
    // Manager's "Company Overview"), which must not be overwritten.
    document.getElementById('topbar-name').textContent = displayName;
    if (target.dbName) {
      const heroName = document.querySelector('#target-hero .th-rep');
      if (heroName) heroName.textContent = displayName;
    }
    window._viewingAs = true;
    document.getElementById('view-as-name').textContent = displayName;
    document.getElementById('view-as-banner').classList.remove('hidden');
  } catch (e) {
    console.error('viewAsRep error:', e);
    alert("Couldn't load that profile — it may not have a rep row yet (not seeded/migrated yet).");
  } finally {
    _viewAsLoading = false;
    if (rowEl) rowEl.classList.remove('ac-row-loading');
  }
}

function exitViewAs() {
  if (_superAdminOwnIdx === null || !_superAdminOwnAuthInfo) return;
  _restoreViewAsNameSwap();
  window._viewingAs = false;
  document.getElementById('view-as-banner').classList.add('hidden');
  selectRep(_superAdminOwnIdx, _superAdminOwnAuthInfo);
}

// ── SUPER ADMIN: edit any rep's profile fields ──
let _editingRepId = null;

async function editRepProfile(idx) {
  const target = REP_CONFIG[idx];
  const lookupName = target.dbName || target.name;
  try {
    await waitForGlobal('AppAuth');
    const repRow = await window.AppAuth.fetchRepForViewAs(lookupName);
    _editingRepId = repRow.id;
    document.getElementById('edit-rep-title').textContent = 'Edit ' + target.name;
    document.getElementById('edit-rep-phone').value = repRow.phone || '';
    document.getElementById('edit-rep-active').checked = !!repRow.active;
    document.getElementById('edit-rep-role').value = repRow.is_manager ? 'manager'
      : repRow.bisdev_category === 'food' ? 'bisdev_food'
      : repRow.bisdev_category === 'beverage' ? 'bisdev_beverage'
      : repRow.is_nestle_coordinator ? 'nestle_coordinator'
      : repRow.is_super_admin ? 'super_admin'
      : 'none';
    document.getElementById('edit-rep-email').textContent = window.AppAuth.deriveLoginAlias(lookupName);
    document.getElementById('edit-rep-error').innerHTML = '&nbsp;';
    document.getElementById('edit-rep-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  } catch (e) {
    console.error('editRepProfile error:', e);
    alert("Couldn't load that profile — it may not have a rep row yet (not seeded yet).");
  }
}

function closeEditRepProfile(e) {
  if (!e || e.target === document.getElementById('edit-rep-overlay')) {
    document.getElementById('edit-rep-overlay').classList.add('hidden');
    document.body.style.overflow = '';
    _editingRepId = null;
  }
}

async function submitEditRepProfile() {
  if (!_editingRepId) return;
  const phone = document.getElementById('edit-rep-phone').value.trim();
  const active = document.getElementById('edit-rep-active').checked;
  const role = document.getElementById('edit-rep-role').value;
  const errEl = document.getElementById('edit-rep-error');
  errEl.innerHTML = '&nbsp;';
  const patch = {
    phone: phone || null,
    active,
    is_manager: role === 'manager',
    bisdev_category: role === 'bisdev_food' ? 'food' : role === 'bisdev_beverage' ? 'beverage' : null,
    is_nestle_coordinator: role === 'nestle_coordinator',
    is_super_admin: role === 'super_admin',
  };
  try {
    await waitForGlobal('AppAuth');
    await window.AppAuth.updateRepAdmin(_editingRepId, patch);
    closeEditRepProfile();
    showToast('Profile updated');
  } catch (e) {
    console.error('submitEditRepProfile error:', e);
    errEl.textContent = 'Could not save — ' + (e.message || e);
  }
}

// ── MANAGER/SUPER ADMIN: reset a rep's PIN ──
// Uses the reset-rep-pin Edge Function (service-role Admin API access —
// only server-side code can force-set another user's password). Setting
// must_change_pin server-side means the existing forced-first-login
// PIN-pad flow (submitPin()/_pinMode below) takes over automatically on
// the rep's next login — nothing else to wire up client-side.
async function resetRepPin(idx) {
  const target = REP_CONFIG[idx];
  const lookupName = target.dbName || target.name;
  if (!await confirmDialog(`Reset ${target.name}'s PIN? They'll be logged out everywhere and forced to choose a new PIN on next login.`)) return;
  try {
    await waitForGlobal('AppAuth');
    await waitForGlobal('AdminActions');
    const repRow = await window.AppAuth.fetchRepForViewAs(lookupName);
    const { tempPin } = await window.AdminActions.resetRepPin(repRow.id);
    alert(`Temporary PIN for ${target.name}: ${tempPin}\n\nTell them to log in with it — they'll be asked to choose a new PIN right away.`);
  } catch (e) {
    console.error('resetRepPin error:', e);
    alert("Couldn't reset that PIN — " + (e.message || e));
  }
}

// Manager-facing entry point — Managers never see renderSuperAdminPanel()
// (that screen's click-through is full session impersonation, a bigger
// capability than a Manager needs), so this is a small purpose-built list
// with just the one action.
function openResetPinPanel() {
  renderResetPinList();
  document.getElementById('reset-pin-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeResetPinPanel(e) {
  if (!e || e.target === document.getElementById('reset-pin-overlay')) {
    document.getElementById('reset-pin-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }
}
function renderResetPinList() {
  const el = document.getElementById('reset-pin-list');
  if (!el) return;
  el.innerHTML = groupRepsForAdmin(currentRep.name).map(([label, reps]) => `
    <div class="area-card">
      <div class="ac-title">${label}</div>
      ${reps.map(r => {
        const idx = REP_CONFIG.indexOf(r);
        return `<div class="ac-row">
          ${avatarHtml(r.name, COLORS[idx % COLORS.length], 26)}
          <div style="flex:1;min-width:0">
            <div class="ac-name">${escHtml(r.name)}</div>
            <div class="ac-area">${escHtml(r.area)}</div>
          </div>
          <button class="of-draft" style="width:36px;height:36px;padding:8px" onclick="resetRepPin(${idx})" title="Reset PIN">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
          </button>
        </div>`;
      }).join('')}
    </div>
  `).join('');
}

// ════════════════
// PRICELIST
// ════════════════
function switchDiv(div, btn) {
  plDiv = div; plCat = 'ALL';
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
    el.innerHTML = `<div class="pl-no-results"><div class="e">${uiIcon('search',32)}</div><p>No products found</p></div>`;
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
    <div class="pl-card-icon ${div}">${catIcon(p.category,20)}</div>
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

  document.getElementById('pm-sold-to').innerHTML = buildSoldToHtml(findCustomersForProduct(p));

  document.getElementById('prod-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeProdModal(e) { if (e.target === document.getElementById('prod-overlay')) closeProdModalBtn(); }
function closeProdModalBtn() {
  document.getElementById('prod-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

// Prefetched ahead of any Share tap — calling navigator.share() after an
// await fetch() can lose the browser's "user activation" window and fail
// silently, so the blob needs to already be in hand by the time Share fires.
const _catalogBlobCache = {};
function prefetchCatalogBlobs() {
  ['MKU Catalog 2026.pdf', 'MKS Catalog 2026.pdf'].forEach(filename => {
    if (_catalogBlobCache[filename]) return;
    _catalogBlobCache[filename] = fetch(filename).then(r => r.blob()).catch(() => null);
  });
}

async function shareCatalog(filename, title, event) {
  event.preventDefault();
  event.stopPropagation();
  const url = new URL(filename, window.location.href).href;
  try {
    const blob = await (_catalogBlobCache[filename] || fetch(filename).then(r => r.blob()));
    if (blob) {
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') return; // user cancelled the share sheet, not an error
    // fall through to the link fallback below
  }
  openWA(`*${title}*\n${url}`);
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

// The purchase-history feed (CUSTOMERS.by_rep[...].products) has no usable
// `category` field (empty in production) and its `code` is an ERP/SO code
// (e.g. "PSJ0044") that never matches our own catalog's ids (e.g. "MKU001")
// — the same cross-system identity mismatch documented in Phase 3. The only
// field with any real signal is `name`, so matching is done by normalizing
// and comparing name prefixes. This is a best-effort heuristic (~40-50% of
// purchased line items resolve to a catalog match in spot checks), not
// exact identity resolution — good enough to infer "categories this
// customer buys from," not to reliably exclude specific already-bought SKUs.
const _catalogMatchCache = new Map();
function _normProductName(name) {
  return (name || '').toLowerCase()
    .replace(/@?\d+(\.\d+)?\s*(kg|gr|g|ltr|lt|l|ml|pack|sack|box|pcs|btl)\b/g, '')
    .replace(/[()@/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function _findCatalogMatch(purchasedName) {
  if (_catalogMatchCache.has(purchasedName)) return _catalogMatchCache.get(purchasedName);
  const norm = _normProductName(purchasedName);
  const words = norm.split(' ').filter(w => w.length > 2).slice(0, 3);
  const prefix = words.join(' ');
  const match = prefix ? PRODUCTS.find(p => _normProductName(p.name).includes(prefix)) || null : null;
  _catalogMatchCache.set(purchasedName, match);
  return match;
}

// "Sold To" (Pricelist product modal): the inverse of _findCatalogMatch
// above — given a catalog product, find every Horeca customer (company-wide,
// every rep) whose purchase history resolves to it. Same ~40-50% recall
// heuristic as getPitchSuggestions' use of _findCatalogMatch; this is a
// known, pre-existing limitation of the underlying data (see comment above
// _catalogMatchCache), not something new to this feature.
//
// "Horeca" excludes: Wira/Sriasih (the two channel/GT-wholesale reps — the
// feed splits their territory into keys like "Sriasih (GT)", so this is a
// prefix match, not ===) and any customer anywhere tagged as a
// Wholesale/Supermarket/Retail/Industry group, regardless of rep.
const NON_HORECA_GROUPS = new Set(['WHOLE SALES', 'SUPERMARKET', 'RETAIL', 'INDUSTRY']);
const NON_HORECA_REP_PREFIXES = ['Wira', 'Sriasih'];
function _isHorecaCustomer(c) {
  if (NON_HORECA_GROUPS.has((c.group || '').toUpperCase())) return false;
  if (NON_HORECA_REP_PREFIXES.some(p => c.sales && c.sales.startsWith(p))) return false;
  return true;
}

const _soldToCache = new Map(); // product.id -> rows
function findCustomersForProduct(product) {
  if (_soldToCache.has(product.id)) return _soldToCache.get(product.id);
  const seen = new Map(); // key: sales+'|'+name -> row
  _flattenAllCustomerEntries().forEach(c => {
    if (!_isHorecaCustomer(c)) return;
    const hasProduct = (c.products || []).some(line => {
      const match = _findCatalogMatch(line.name);
      return match && match.id === product.id;
    });
    if (!hasProduct) return;
    const key = c.sales + '|' + c.name;
    if (!seen.has(key)) seen.set(key, { customer: c.name, area: c.area, rep: c.sales, group: c.group });
  });
  const rows = [...seen.values()];
  _soldToCache.set(product.id, rows);
  return rows;
}

const GROUP_DISPLAY_NAMES = {
  HOTEL: 'Hotel', RESTAURANT: 'Restaurant', 'BEACH CLUB': 'Beach Club',
  BAR: 'Bar', CATERING: 'Catering', 'NIGHT CLUB': 'Night Club',
  KARAOKE: 'Karaoke', 'LEISURE & EDUCATION': 'Leisure & Education', OTHERS: 'Others',
};
const SECTOR_ORDER = ['HOTEL', 'RESTAURANT', 'BEACH CLUB', 'BAR', 'NIGHT CLUB', 'CATERING', 'KARAOKE', 'LEISURE & EDUCATION', 'OTHERS'];

function buildSoldToHtml(rows) {
  if (!rows.length) {
    return `<div class="pm-sold-title">Sold To</div>
      <div class="tc-coming-soon">No Horeca purchase history found for this product yet</div>`;
  }
  const bySector = new Map();
  rows.forEach(r => {
    const key = (r.group || '').toUpperCase();
    const bucket = SECTOR_ORDER.includes(key) ? key : 'OTHERS';
    if (!bySector.has(bucket)) bySector.set(bucket, []);
    bySector.get(bucket).push(r);
  });
  const CAP = 15;
  let h = `<div class="pm-sold-title">Sold To <span style="font-weight:400;color:var(--txt3);font-size:.68rem">(${rows.length} · Horeca only, approximate)</span></div>
    <div class="tc-so">`;
  SECTOR_ORDER.filter(s => bySector.has(s)).forEach(sector => {
    const list = bySector.get(sector).sort((a, b) => a.customer.localeCompare(b.customer));
    const shown = list.slice(0, CAP);
    const hidden = list.length - shown.length;
    h += `<div class="tc-so-group"><div class="tc-so-cust-hdr"><div class="tc-so-cust">${GROUP_DISPLAY_NAMES[sector]}</div><div class="tc-so-cust-total neutral">${list.length}</div></div>`;
    shown.forEach(r => {
      h += `<div class="tc-so-row"><div class="tc-so-prod">${escHtml(r.customer)}</div><div class="tc-so-qty">${escHtml(r.rep)} · ${escHtml(r.area || '')}</div></div>`;
    });
    if (hidden > 0) h += `<div class="tc-coming-soon" style="padding:4px 8px;font-size:.68rem">+${hidden} more</div>`;
    h += `</div>`;
  });
  h += `</div>`;
  return h;
}

// Gap analysis: what a customer isn't currently buying, to build a pitch
// from — not "reuse their last order" (they tell us that themselves via
// their own PO/WhatsApp), but "what's worth suggesting to them."
function getPitchSuggestions(customerEntry) {
  const bought = customerEntry.products || [];
  const boughtNames = [...new Set(bought.map(p => p.name))];
  const boughtCats = new Set();
  const boughtDivisions = new Set();
  boughtNames.forEach(name => {
    const match = _findCatalogMatch(name);
    if (match) { boughtCats.add(match.category); boughtDivisions.add(match.division); }
  });

  // Only genuinely untapped categories — a customer who's already a heavy
  // buyer in a category doesn't need more suggestions there (that
  // relationship is already settled); the real pitch opportunity is
  // categories they've never touched at all.
  const newCategories = [];
  const seenCats = new Set();
  for (const p of PRODUCTS) {
    if (boughtDivisions.size && !boughtDivisions.has(p.division)) continue;
    if (boughtCats.has(p.category) || seenCats.has(p.category)) continue;
    seenCats.add(p.category);
    newCategories.push(p);
    if (newCategories.length >= 5) break;
  }
  return newCategories;
}

function renderOrder() {
  updateDraftsCount();
  const ids = Object.keys(orderItems);
  const body = document.getElementById('order-body');

  if (!ids.length) {
    body.innerHTML = `<div class="order-empty">
      <div class="oe-ico">${uiIcon('cart',40)}</div>
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
      <button class="of-draft" onclick="saveOrderDraft()" title="Save as draft">${uiIcon('bookmark',18)}</button>
      <button class="of-clear" onclick="clearOrder()" title="Clear all">${uiIcon('trash',18)}</button>
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

// ── PITCH SUGGESTIONS (customer name → gap-analysis panel) ──
function onOrderCustInput(name) {
  const trimmed = name.trim().toLowerCase();
  const panel = document.getElementById('order-suggestions');
  const dropdown = document.getElementById('order-cust-dropdown');

  if (!trimmed) {
    panel.classList.add('hidden'); panel.innerHTML = '';
    dropdown.classList.add('hidden'); dropdown.innerHTML = '';
    return;
  }

  const all = getRepCustomerList();
  const entry = all.find(c => c.name.trim().toLowerCase() === trimmed);

  // Custom dropdown: substring matches, capped, hidden once the typed text
  // exactly matches a customer (they've effectively already selected one).
  if (entry) {
    dropdown.classList.add('hidden'); dropdown.innerHTML = '';
  } else {
    const matches = all
      .filter(c => c.name.toLowerCase().includes(trimmed))
      .sort((a, b) => (b.total||0) - (a.total||0))
      .slice(0, 8);
    if (matches.length) {
      dropdown.innerHTML = matches.map(c => `<div class="order-cust-opt" onclick="selectOrderCust('${escHtml(c.name).replace(/'/g,"\\'")}')">
        ${escHtml(c.name)}
        <div class="order-cust-opt-area">${escHtml(c.area||'')}</div>
      </div>`).join('');
      dropdown.classList.remove('hidden');
    } else {
      dropdown.classList.add('hidden'); dropdown.innerHTML = '';
    }
  }

  if (!entry) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
  renderPitchSuggestions(entry);
}

function selectOrderCust(name) {
  const inp = document.getElementById('order-cust');
  inp.value = name;
  document.getElementById('order-cust-dropdown').classList.add('hidden');
  onOrderCustInput(name);
}

document.addEventListener('click', e => {
  const dropdown = document.getElementById('order-cust-dropdown');
  if (!dropdown || dropdown.classList.contains('hidden')) return;
  if (e.target.closest('#order-cust-dropdown') || e.target.closest('#order-cust')) return;
  dropdown.classList.add('hidden');
});

function renderPitchSuggestions(entry) {
  const panel = document.getElementById('order-suggestions');
  const newCategories = getPitchSuggestions(entry);
  if (!newCategories.length) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }

  const chip = p => `<div class="sugg-chip" onclick="addSuggestedItem('${p.id}')">
    ${catIcon(p.category, 14)}
    <span class="sugg-chip-name">${escHtml(p.name)}</span>
    <span class="sugg-chip-add">+</span>
  </div>`;

  panel.innerHTML = `
    <div class="sugg-title">Suggested for ${escHtml(entry.name)}</div>
    <div class="sugg-group-lbl">Categories they haven't tried yet</div>
    <div class="sugg-chips">${newCategories.map(chip).join('')}</div>`;
  panel.classList.remove('hidden');
}

function addSuggestedItem(id) {
  orderItems[id] = (orderItems[id] || 0) + 1;
  updateOrderBadge();
  renderOrder();
  const p = PRODUCTS.find(x => x.id === id);
  if (p) showToast(`Added: ${p.name.split(' ').slice(0,3).join(' ')} ✓`);
}

// ── SAVED DRAFTS (localStorage, namespaced per rep — personal scratch
// work, not team-shared data, so no Supabase table needed) ──
function draftsKey() {
  return `mkuv2_drafts_${currentRep?.repId || 'local'}`;
}

function getDrafts() {
  try { return JSON.parse(localStorage.getItem(draftsKey())) || []; }
  catch (e) { return []; }
}

function setDrafts(drafts) {
  localStorage.setItem(draftsKey(), JSON.stringify(drafts));
  updateDraftsCount();
}

function updateDraftsCount() {
  const el = document.getElementById('order-drafts-count');
  if (!el) return;
  const n = getDrafts().length;
  el.textContent = n;
  el.classList.toggle('hidden', n === 0);
}

function saveOrderDraft() {
  if (!Object.keys(orderItems).length) return;
  const custName = document.getElementById('order-cust').value.trim();
  const defaultName = custName || `Draft ${new Date().toLocaleDateString('id-ID', { day:'numeric', month:'short' })}`;
  const name = prompt('Name this draft:', defaultName);
  if (name === null) return;
  const notes = document.getElementById('order-notes').value.trim();
  const drafts = getDrafts();
  drafts.push({
    id: 'd' + Date.now(),
    name: name.trim() || defaultName,
    custName, notes,
    items: { ...orderItems },
    savedAt: new Date().toISOString(),
  });
  setDrafts(drafts);
  showToast('Draft saved');
}

function openDraftsList() {
  renderDraftsList();
  document.getElementById('drafts-overlay').classList.remove('hidden');
}

function closeDraftsList(e) {
  if (!e || e.target === document.getElementById('drafts-overlay'))
    document.getElementById('drafts-overlay').classList.add('hidden');
}

function renderDraftsList() {
  const el = document.getElementById('drafts-list');
  const drafts = getDrafts();
  if (!drafts.length) { el.innerHTML = '<div class="cm-empty-note">No saved drafts</div>'; return; }
  el.innerHTML = drafts.slice().reverse().map(d => {
    const itemCount = Object.values(d.items).reduce((a,b)=>a+b,0);
    const total = Object.entries(d.items).reduce((sum, [id, qty]) => {
      const p = PRODUCTS.find(x => x.id === id);
      if (!p) return sum;
      const tierIdx = qty >= 11 ? 2 : qty >= 6 ? 1 : 0;
      return sum + tierPrice(p.priceUnit, tierIdx) * qty;
    }, 0);
    const dt = new Date(d.savedAt).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'2-digit' });
    return `<div class="draft-card">
      <div class="draft-info">
        <div class="draft-name">${escHtml(d.name)}</div>
        <div class="draft-meta">${d.custName ? escHtml(d.custName)+' · ' : ''}${Object.keys(d.items).length} product(s) · ${itemCount} units · ${fmtShort(total)} · ${dt}</div>
      </div>
      <div class="draft-actions">
        <button onclick="loadDraft('${d.id}')">Load</button>
        <button onclick="deleteDraft('${d.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function loadDraft(id) {
  const drafts = getDrafts();
  const draft = drafts.find(d => d.id === id);
  if (!draft) return;
  if (Object.keys(orderItems).length && !await confirmDialog('Replace the current order with this draft?')) return;
  orderItems = { ...draft.items };
  document.getElementById('order-cust').value = draft.custName || '';
  document.getElementById('order-notes').value = draft.notes || '';
  updateOrderBadge();
  renderOrder();
  onOrderCustInput(draft.custName || '');
  closeDraftsList();
  showToast('Draft loaded');
}

async function deleteDraft(id) {
  if (!await confirmDialog('Delete this draft?')) return;
  setDrafts(getDrafts().filter(d => d.id !== id));
  renderDraftsList();
}

// ════════════════
// STOCK SCREEN
// ════════════════
function switchStockDiv(div, btn) {
  stockDiv = div;
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

// Stock rows and the product catalog are separate raw data sources with no
// shared id — matches by the same fuzzy first-8-chars-of-name convention
// getStockItem() already uses to correlate the two.
// Memoized by name — PRODUCTS is static for the session, so a given stock
// item name's classification never changes. Without this, every keystroke
// in the stock search box re-scanned all ~571 products per stock item.
let _nestleStockCache = null;
function isNestleStockItem(s) {
  if (!s.name) return false;
  if (!_nestleStockCache) _nestleStockCache = new Map();
  if (_nestleStockCache.has(s.name)) return _nestleStockCache.get(s.name);
  const sPrefix = s.name.toLowerCase().substring(0, 8);
  const result = PRODUCTS.some(p => p.category === 'Nestle' && p.name.toLowerCase().includes(sPrefix));
  _nestleStockCache.set(s.name, result);
  return result;
}

function renderStock() {
  // Nestlé reps/coordinator: same lock as the Pricelist (renderPricelist())
  // — force MKS, Nestlé products only, hide the MKU/MKS toggle.
  const nestleOnly = currentRep && (isNestleRep(currentRep.name) || currentRep.isNestleCoordinator);
  const divTabs = document.getElementById('stock-divtabs');
  if (nestleOnly) {
    stockDiv = 'MKS';
    if (divTabs) divTabs.style.display = 'none';
  } else if (divTabs) {
    divTabs.style.display = '';
  }

  let items = getStockData(stockDiv);
  if (nestleOnly) items = items.filter(isNestleStockItem);

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
    document.getElementById('stock-list').innerHTML = `<div class="pl-no-results"><div class="e">${uiIcon('box',32)}</div><p>No items found</p></div>`;
    return;
  }

  // Count all items (unfiltered) and stamp counts onto filter buttons
  let allItems = getStockData(stockDiv);
  if (nestleOnly) allItems = allItems.filter(isNestleStockItem);
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
        <div class="tk-tip-ico">${uiIcon('bulb',16)}</div>
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
          <span style="color:${m.color||'var(--red)'}">${modIcon(m.icon, 22)}</span>
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
let _announcements = [];

function getReadIds() {
  try { return JSON.parse(localStorage.getItem(ANN_KEY) || '[]'); } catch { return []; }
}

function markAllRead() {
  const ids = _announcements.map(a => a.id);
  localStorage.setItem(ANN_KEY, JSON.stringify(ids));
  updateBellBadge();
}

function updateBellBadge() {
  const read = getReadIds();
  const unread = _announcements.filter(a => !read.includes(a.id)).length;
  const badge = document.getElementById('bell-badge');
  if (!badge) return;
  badge.textContent = unread;
  badge.classList.toggle('hidden', unread === 0);
}

// Fetches live announcements for the signed-in rep (RLS already scopes to
// company-wide + anything targeted at them) and refreshes the bell badge.
// Called once at login — toggleAnnouncements() then just renders whatever
// is already in _announcements, no need to re-fetch on every bell tap.
async function loadAnnouncements() {
  try {
    await waitForGlobal('Announcements');
    _announcements = await window.Announcements.fetchAnnouncements();
    updateBellBadge();
    // Refresh the list too in case the panel is already open (e.g. right
    // after a Manager sends a new one) — harmless no-op if it's hidden.
    renderAnnouncements();
    // Auto-show panel if there's an unread Urgent announcement
    const read = getReadIds();
    const hasUrgent = _announcements.some(a => a.category === 'Urgent' && !read.includes(a.id));
    if (hasUrgent) setTimeout(() => toggleAnnouncements(), 700);
  } catch (e) {
    console.error('loadAnnouncements error:', e);
  }
}

function toggleAnnouncements() {
  const overlay = document.getElementById('ann-overlay');
  if (!overlay) return;
  if (overlay.classList.contains('hidden')) {
    renderAnnouncements();
    const newBtn = document.getElementById('ann-new-btn');
    if (newBtn) newBtn.classList.toggle('hidden', !(currentRep?.isManager || currentRep?.isSuperAdmin));
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
  if (!_announcements.length) {
    list.innerHTML = '<div class="ann-empty">No announcements yet</div>';
    return;
  }

  const CAT_COLORS = {
    'Urgent':  { bg:'#FEE2E2', border:'#AD1F28', text:'#AD1F28' },
    'Promo':   { bg:'#FDF5E4', border:'#B07D1A', text:'#B07D1A' },
    'Product': { bg:'#EDF2FB', border:'#0F2E5C', text:'#0F2E5C' },
    'General': { bg:'#F4F4F6', border:'#AEAEB8', text:'#54545E' },
  };

  list.innerHTML = _announcements.map(a => {
    const c = CAT_COLORS[a.category] || CAT_COLORS['General'];
    const d = new Date(a.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'2-digit' });
    const author = a.reps ? a.reps.name : 'Manager';
    return `<div class="ann-card" style="border-left:3px solid ${c.border}">
      <div class="ann-card-top">
        <span class="ann-cat" style="background:${c.bg};color:${c.text}">${a.category}</span>
        <span class="ann-date">${d} · ${escHtml(author)}${a.target_rep_id ? ' · Private' : ''}</span>
        ${currentRep?.isSuperAdmin ? `
        <span class="intel-card-actions">
          <button onclick="deleteAnnouncementConfirm('${a.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>
          </button>
        </span>` : ''}
      </div>
      <div class="ann-title">${escHtml(a.title)}</div>
      <div class="ann-msg">${escHtml(a.message)}</div>
    </div>`;
  }).join('');
}

function openSendAnnouncement() {
  document.getElementById('ann-title').value = '';
  document.getElementById('ann-message').value = '';
  document.getElementById('ann-category').value = 'General';
  const targetSel = document.getElementById('ann-target');
  targetSel.innerHTML = '<option value="">Everyone</option>' +
    REP_CONFIG.filter(r => r.name !== 'Manager' && r.name !== 'Super Admin')
      .map(r => `<option value="${escHtml(r.name)}">${escHtml(r.name)}</option>`).join('');
  document.getElementById('ann-form-error').innerHTML = '&nbsp;';
  document.getElementById('send-ann-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSendAnnouncement(e) {
  if (!e || e.target === document.getElementById('send-ann-overlay')) {
    document.getElementById('send-ann-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }
}

async function submitSendAnnouncement() {
  const title = document.getElementById('ann-title').value.trim();
  const message = document.getElementById('ann-message').value.trim();
  const category = document.getElementById('ann-category').value;
  const targetName = document.getElementById('ann-target').value;
  const errEl = document.getElementById('ann-form-error');
  if (!title || !message) { errEl.textContent = 'Title and message are required.'; return; }

  errEl.innerHTML = '&nbsp;';
  try {
    await waitForGlobal('Announcements');
    let target_rep_id = null;
    if (targetName) {
      target_rep_id = await window.Announcements.resolveRepIdByName(targetName);
    }
    await window.Announcements.createAnnouncement({
      author_rep_id: currentRep.repId, target_rep_id, title, message, category,
    });
    closeSendAnnouncement();
    showToast('Notification sent');
    loadAnnouncements();
  } catch (e) {
    if (window.WriteQueue && window.WriteQueue.isOfflineError(e)) {
      // targetName (not a resolved id) — resolveRepIdByName() above may be
      // exactly what just failed offline, so resolution is deferred to
      // replay time instead (see _replayQueueItem's 'announcement-create').
      await window.WriteQueue.enqueue({ type: 'announcement-create', payload: { author_rep_id: currentRep.repId, targetName: targetName || null, title, message, category } });
      closeSendAnnouncement();
      showToast('Saved offline — will send when back online', 4500);
      return;
    }
    console.error('createAnnouncement error:', e);
    errEl.textContent = 'Could not send — ' + (e.message || e);
  }
}

async function deleteAnnouncementConfirm(id) {
  if (!await confirmDialog('Delete this announcement for everyone?')) return;
  try {
    await waitForGlobal('Announcements');
    await window.Announcements.deleteAnnouncement(id);
    showToast('Announcement deleted');
    loadAnnouncements();
  } catch (e) {
    console.error('deleteAnnouncement error:', e);
    showToast('Could not delete — ' + (e.message || e));
  }
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
let _custModalCustomerId = null;
let _editingContactId = null;

const MONTH_ORDER_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const MONTH_SHORT = {
  'January':'Jan','February':'Feb','March':'Mar','April':'Apr',
  'May':'May','June':'Jun','July':'Jul','August':'Aug',
  'September':'Sep','October':'Oct','November':'Nov','December':'Dec'
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
// Buckets in the Dashboard feed that aren't a real field rep (aggregation/
// unassigned buckets from the source data) — excluded from the company-wide
// customer list since they're not actionable for a sales-rep-scoped tool.
const NON_REP_CUSTOMER_BUCKETS = new Set(['Management Bali', 'Sales Retail', 'Unknown', 'KA']);

// Flattens every rep's customers into one company-wide array, skipping the
// non-rep buckets above. Shared by getRepCustomerList()'s all-company branch
// and findCustomersForProduct() (which always wants company-wide, regardless
// of the calling rep's role).
function _flattenAllCustomerEntries() {
  const entries = [];
  for (const [repName, repData] of Object.entries(CUSTOMERS.by_rep || {})) {
    if (NON_REP_CUSTOMER_BUCKETS.has(repName)) continue;
    for (const [code, c] of Object.entries(repData.customers || {}))
      entries.push({code, ...c, sales: repName});
  }
  return mergeDuplicateCustomers(entries);
}

function getRepCustomerList() {
  if (typeof CUSTOMERS === 'undefined' || !CUSTOMERS.by_rep) return [];
  const rep = window._currentRep || '';
  let entries = [];
  if (!rep || rep === 'Management Bali' || currentRep?.isManager) {
    return _flattenAllCustomerEntries();
  } else if (currentRep?.isNestleCoordinator) {
    return _flattenAllCustomerEntries().filter(e => isNestleRep(e.sales));
  } else {
    const exactData = CUSTOMERS.by_rep[rep];
    if (exactData) {
      for (const [code, c] of Object.entries(exactData.customers || {}))
        entries.push({code, ...c, sales: rep});
    } else {
      // Fallback 1: collect all keys that start with rep name (e.g. "Sriasih (GT)" + "Sriasih (MT)")
      let matched = false;
      for (const [key, repData] of Object.entries(CUSTOMERS.by_rep)) {
        if (key.startsWith(rep + ' ') || key.startsWith(rep + '(')) {
          matched = true;
          for (const [code, c] of Object.entries(repData.customers || {}))
            entries.push({code, ...c, sales: rep});
        }
      }
      // Fallback 2: explicit aliases — this feed labels some reps' territory
      // under a completely different name (see REP_CONFIG[].aliases), so a
      // prefix scan alone won't find it.
      if (!matched) {
        for (const alias of currentRep?.aliases || []) {
          const aliasData = CUSTOMERS.by_rep[alias];
          if (!aliasData) continue;
          for (const [code, c] of Object.entries(aliasData.customers || {}))
            entries.push({code, ...c, sales: rep});
        }
      }
    }
  }
  return mergeDuplicateCustomers(entries);
}

// Resolves a (repName, custCode) pair to the real CUSTOMERS.by_rep entry.
// Multi-area reps (e.g. Sriasih, Wira) have their source data split across
// keys like "Sriasih (GT)"/"Sriasih (MT)" — the plain rep name isn't itself
// a real by_rep key for them, so fall back to a prefix scan same as
// getRepCustomerList() does above.
function resolveRepCustomerRecord(repName, custCode) {
  if (typeof CUSTOMERS === 'undefined' || !CUSTOMERS.by_rep) return null;
  const exact = CUSTOMERS.by_rep[repName];
  if (exact?.customers?.[custCode]) return exact.customers[custCode];
  for (const [key, repData] of Object.entries(CUSTOMERS.by_rep)) {
    if ((key.startsWith(repName + ' ') || key.startsWith(repName + '(')) && repData.customers?.[custCode]) {
      return repData.customers[custCode];
    }
  }
  // Explicit aliases (see REP_CONFIG[].aliases) — only applies when resolving
  // the currently-viewed rep, since aliases are looked up off currentRep.
  if (currentRep?.name === repName) {
    for (const alias of currentRep.aliases || []) {
      if (CUSTOMERS.by_rep[alias]?.customers?.[custCode]) return CUSTOMERS.by_rep[alias].customers[custCode];
    }
  }
  return null;
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
  const contactsBtn = document.getElementById('cust-contacts-btn');
  if (contactsBtn) contactsBtn.classList.toggle('hidden', !(currentRep?.isManager || currentRep?.isSuperAdmin));
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

// Must mirror the SQL formula in supabase/migrations/0004_customers.sql's
// get_or_create_customer() — same "keep in sync manually" convention as
// scripts/seed-reps.mjs's duplicated REP_CONFIG (can't share code across a
// JS/SQL boundary, so it's a comment-cross-referenced duplicate instead).
function normalizedKey(name, area) {
  return (name||'').trim().toUpperCase() + '|' + (area||'').trim().toUpperCase();
}

// Months since a customer's last order — shared by the Customers screen's
// "Inactive" filter/tag and the Today screen's inactive-customer signal.
function monthsSinceLastOrder(c) {
  const curMonthName = (RAW.month || '').split(' ')[0];
  return c.last_month ? monthIdx(curMonthName) - monthIdx(c.last_month) : 99;
}

function renderCustomers() {
  const el = document.getElementById('cust-list');
  if (!el || typeof CUSTOMERS === 'undefined') return;

  let custs = getRepCustomerList();

  if (_custGroup === 'INACTIVE') {
    custs = custs.filter(c => monthsSinceLastOrder(c) >= 2);
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
    const icon = groupIcon(c.group);
    const rev = fmtShort(c.total);
    const lastMon = MONTH_SHORT[c.last_month] || c.last_month || '—';
    const growth = getGrowth(c.monthly);
    const sparkHtml = months.length >= 2 ? buildSparkline(c.monthly, months) : '';
    const growthHtml = growth !== null
      ? `<span class="cust-growth ${growth>=0?'pos':'neg'}">${growth>=0?'↑':'↓'}${Math.abs(growth)}%</span>`
      : '';
    // Inactive alert — months since last order
    const mAgo = monthsSinceLastOrder(c);
    const lastStyle = mAgo >= 2 ? 'color:var(--red);font-weight:600' : mAgo === 1 ? 'color:var(--gold)' : '';
    const inactiveTag = mAgo >= 2 ? ` <span style="font-size:.6rem;background:var(--red-l);color:var(--red);padding:1px 5px;border-radius:4px;font-weight:700"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg> ${mAgo}mo</span>` : '';

    return `<div class="cust-card" onclick="openCustModal('${escHtml(c.sales)}','${escHtml(c.code)}')">
      <div class="cust-card-top">
        <div class="cust-card-icon">${icon}</div>
        <div class="cust-card-info">
          <div class="cust-card-name">${escHtml(c.name)}</div>
          <div class="cust-card-sub">${escHtml(c.area||'')} · ${escHtml(c.group||'')}${currentRep?.isManager ? ' · '+escHtml(c.sales||'') : ''}</div>
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

// ── CONTACTS DIRECTORY (Manager) ──
let _contactsDirData = [];
let _contactsDirQuery = '';

function openContactsDirectory() {
  const overlay = document.getElementById('contacts-directory-overlay');
  const list = document.getElementById('contacts-directory-list');
  document.getElementById('contacts-directory-search').value = '';
  _contactsDirQuery = '';
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  list.innerHTML = `<div class="cust-loading">
    <div class="cust-loading-spinner"></div>
    <div class="cust-loading-txt">Loading contacts…</div>
  </div>`;
  waitForGlobal('CustomerRelations')
    .then(() => window.CustomerRelations.fetchAllContacts())
    .then(contacts => { _contactsDirData = contacts; renderContactsDirectory(); })
    .catch(e => {
      console.error('fetchAllContacts error:', e);
      list.innerHTML = `<div class="cust-empty">Couldn't load contacts.<br><span style="font-size:.7rem;opacity:.6">${e.message||e}</span></div>`;
    });
}

function closeContactsDirectory(e) {
  if (!e || e.target === document.getElementById('contacts-directory-overlay')) {
    document.getElementById('contacts-directory-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function onContactsDirectorySearch(v) {
  _contactsDirQuery = v.trim().toLowerCase();
  renderContactsDirectory();
}

function renderContactsDirectory() {
  const list = document.getElementById('contacts-directory-list');
  if (!list) return;
  const q = _contactsDirQuery;
  const rows = q
    ? _contactsDirData.filter(c =>
        (c.name||'').toLowerCase().includes(q) ||
        (c.phone||'').toLowerCase().includes(q) ||
        (c.customers?.name||'').toLowerCase().includes(q))
    : _contactsDirData;
  if (!rows.length) {
    list.innerHTML = `<div class="cust-empty">${q ? 'No matching contacts' : 'No contacts logged yet'}</div>`;
    return;
  }
  // Resolve each contact's customer back to a (sales, code) pair so tapping
  // can open the real customer modal — customer_contacts is keyed by the
  // Phase 3 customers.id, while the modal is keyed by the JS-side (rep,
  // code) identity, so bridge via the same normalizedKey() both sides share.
  const custByKey = {};
  getRepCustomerList().forEach(c => { custByKey[normalizedKey(c.name, c.area)] = c; });

  list.innerHTML = rows.map(c => {
    const custName = c.customers?.name || 'Unknown customer';
    const custArea = c.customers?.area || '';
    const match = custByKey[normalizedKey(custName, custArea)];
    const clickable = !!match;
    return `<div class="contacts-dir-card"${clickable ? ` onclick="closeContactsDirectory();openCustModal('${escHtml(match.sales)}','${escHtml(match.code)}')"` : ''} style="${clickable?'cursor:pointer':''}">
      <div class="contacts-dir-name">${escHtml(c.name)}</div>
      <div class="contacts-dir-meta">${[c.role, c.phone].filter(Boolean).map(escHtml).join(' · ')}</div>
      <div class="contacts-dir-cust">${escHtml(custName)}${custArea ? ' · '+escHtml(custArea) : ''}</div>
    </div>`;
  }).join('');
}

// ── PROFILE ──
function refreshTopbarAvatar() {
  const avatarEl = document.getElementById('topbar-avatar');
  if (!avatarEl) return;
  avatarEl.style.background = currentRep._color;
  if (currentRep.photoUrl) {
    avatarEl.style.padding = '0';
    avatarEl.style.overflow = 'hidden';
    avatarEl.innerHTML = `<img src="${escHtml(currentRep.photoUrl)}" style="width:100%;height:100%;object-fit:cover" alt="">`;
  } else {
    avatarEl.style.padding = '';
    avatarEl.style.overflow = '';
    avatarEl.textContent = repInitials(currentRep.name);
  }
}

function openProfile() {
  document.getElementById('profile-name').value = currentRep.name;
  document.getElementById('profile-phone').value = currentRep.phone || '';
  document.getElementById('profile-form-error').innerHTML = '&nbsp;';
  document.getElementById('profile-avatar-preview').innerHTML =
    avatarHtml(currentRep.name, currentRep._color, 72, currentRep.photoUrl);
  document.getElementById('profile-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeProfile(e) {
  if (!e || e.target === document.getElementById('profile-overlay')) {
    document.getElementById('profile-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }
}

async function onProfilePhotoSelected(file) {
  if (!file) return;
  const errEl = document.getElementById('profile-form-error');
  errEl.innerHTML = '&nbsp;';
  try {
    await waitForGlobal('RepProfile');
    const photoUrl = await window.RepProfile.uploadPhoto(currentRep.repId, file);
    currentRep.photoUrl = photoUrl;
    document.getElementById('profile-avatar-preview').innerHTML =
      avatarHtml(currentRep.name, currentRep._color, 72, photoUrl);
    refreshTopbarAvatar();
    showToast('Photo updated');
  } catch (e) {
    if (window.WriteQueue && window.WriteQueue.isOfflineError(e)) {
      await window.WriteQueue.enqueue({ type: 'profile-photo', payload: { repId: currentRep.repId }, blob: file });
      showToast('Saved offline — will upload when back online', 4500);
      return;
    }
    console.error('uploadPhoto error:', e);
    errEl.textContent = 'Could not upload photo — ' + friendlyPhotoUploadError(e);
  }
}

// Photo uploads fail silently-ish from the rep's POV — a raw Supabase error
// string doesn't tell them (or us, secondhand) whether it's a one-off
// network blip or a deployment issue (bucket missing / their account not
// linked to auth) that needs a manager to fix. Surface which kind it is.
function friendlyPhotoUploadError(e) {
  const msg = e?.message || String(e);
  if (/bucket not found/i.test(msg)) {
    return 'photo storage isn’t set up yet — tell your manager (bucket missing).';
  }
  if (/row-level security|RLS|policy/i.test(msg)) {
    return 'upload blocked by permissions — tell your manager (account not linked).';
  }
  return msg;
}

async function submitProfileForm() {
  const phone = document.getElementById('profile-phone').value.trim();
  const errEl = document.getElementById('profile-form-error');
  errEl.innerHTML = '&nbsp;';
  try {
    await waitForGlobal('RepProfile');
    await window.RepProfile.updatePhone(currentRep.repId, phone || null);
    currentRep.phone = phone || null;
    closeProfile();
    showToast('Profile updated');
  } catch (e) {
    if (window.WriteQueue && window.WriteQueue.isOfflineError(e)) {
      await window.WriteQueue.enqueue({ type: 'profile-phone', payload: { repId: currentRep.repId, phone: phone || null } });
      currentRep.phone = phone || null;
      closeProfile();
      showToast('Saved offline — will sync when back online', 4500);
      return;
    }
    console.error('updatePhone error:', e);
    errEl.textContent = 'Could not save — ' + (e.message || e);
  }
}

// ── CHANGE PIN (self-service, from Profile) ──
const CP_LENGTH = 6;
let _cpMode = 'set'; // 'set' | 'confirm'
let _cpBuffer = '';
let _cpNewPin = '';

function openChangePin() {
  _cpMode = 'set';
  _cpBuffer = '';
  _cpNewPin = '';
  document.getElementById('change-pin-title').textContent = 'Choose a new PIN';
  document.getElementById('change-pin-error').innerHTML = '&nbsp;';
  renderChangePinDots();
  document.getElementById('change-pin-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeChangePin(e) {
  if (!e || e.target === document.getElementById('change-pin-overlay')) {
    document.getElementById('change-pin-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function renderChangePinDots() {
  const wrap = document.getElementById('change-pin-dots');
  wrap.innerHTML = '';
  for (let i = 0; i < CP_LENGTH; i++) {
    const dot = document.createElement('div');
    dot.className = 'login-pin-dot' + (i < _cpBuffer.length ? ' filled' : '');
    wrap.appendChild(dot);
  }
}

function onChangePinBackspace() {
  if (!_cpBuffer.length) return;
  _cpBuffer = _cpBuffer.slice(0, -1);
  document.getElementById('change-pin-error').innerHTML = '&nbsp;';
  renderChangePinDots();
}

function onChangePinDigit(d) {
  if (_cpBuffer.length >= CP_LENGTH) return;
  _cpBuffer += d;
  renderChangePinDots();
  if (_cpBuffer.length !== CP_LENGTH) return;

  if (_cpMode === 'set') {
    _cpNewPin = _cpBuffer;
    _cpBuffer = '';
    _cpMode = 'confirm';
    document.getElementById('change-pin-title').textContent = 'Confirm your new PIN';
    document.getElementById('change-pin-error').innerHTML = '&nbsp;';
    renderChangePinDots();
  } else {
    if (_cpBuffer === _cpNewPin) {
      finishChangePin();
    } else {
      _cpMode = 'set';
      _cpNewPin = '';
      _cpBuffer = '';
      document.getElementById('change-pin-title').textContent = 'Choose a new PIN';
      document.getElementById('change-pin-error').textContent = "PINs didn't match. Try again.";
      renderChangePinDots();
    }
  }
}

async function finishChangePin() {
  try {
    await waitForGlobal('AppAuth');
    await window.AppAuth.changePin(_cpNewPin);
    closeChangePin();
    showToast('PIN updated');
  } catch (e) {
    console.error('changePin error:', e);
    _cpMode = 'set';
    _cpNewPin = '';
    _cpBuffer = '';
    document.getElementById('change-pin-title').textContent = 'Choose a new PIN';
    const reason = e?.raw?.message || e?.message || 'Unknown error';
    document.getElementById('change-pin-error').textContent = "Couldn't save new PIN — " + reason;
    renderChangePinDots();
  }
}

// ── MODAL ──
function openCustModal(repName, custCode) {
  if (typeof CUSTOMERS === 'undefined') return;
  const c = resolveRepCustomerRecord(repName, custCode);
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
  const rev = fmtShort(c.total);
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
      const vStr = fmtShort(v);
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

  loadCustRelations(c.name, c.area);
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
      <span class="cm-top5-rev">${fmtShort(p.value)}</span>
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
  const c = resolveRepCustomerRecord(_custModalRep, _custModalKey);
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
  const c = resolveRepCustomerRecord(_custModalRep, _custModalKey);
  if (c) _renderHistory(c, _custModalMonth);
}

function _productRow(p) {
  const rev = fmtShort(p.value);
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
  if (!e || e.target===document.getElementById('cust-overlay')) {
    document.getElementById('cust-overlay').classList.add('hidden');
    document.getElementById('cust-modal').style.transform = '';
    _custModalCustomerId = null;
    document.getElementById('cm-contacts').innerHTML = '';
    document.getElementById('cm-visits').innerHTML = '';
  }
}
window.refreshCustIfOpen = function() {
  if (_custModalRep && _custModalKey) openCustModal(_custModalRep, _custModalKey);
};

// ── SWIPE-DOWN-TO-DISMISS (customer modal) ──
(function initCustModalSwipe() {
  const handle = document.querySelector('#cust-modal .pm-handle');
  const modal = document.getElementById('cust-modal');
  if (!handle || !modal) return;
  let startY = 0, dragY = 0, dragging = false;
  handle.addEventListener('touchstart', e => {
    dragging = true;
    startY = e.touches[0].clientY;
    modal.style.transition = 'none';
  }, { passive: true });
  handle.addEventListener('touchmove', e => {
    if (!dragging) return;
    dragY = Math.max(0, e.touches[0].clientY - startY);
    modal.style.transform = `translateY(${dragY}px)`;
  }, { passive: true });
  handle.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    modal.style.transition = '';
    if (dragY > 100) {
      closeCustModal();
    } else {
      modal.style.transform = '';
    }
    dragY = 0;
  });
})();

function shareCustomerWA() {
  if (!_custModalRep || !_custModalKey || typeof CUSTOMERS==='undefined') return;
  const c = resolveRepCustomerRecord(_custModalRep, _custModalKey);
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
    `Total YTD: ${fmtShort(c.total)} ${growthStr}`,
    `Last Order: ${c.last_month||'—'}`,
    '',
    '*Top Products (YTD):*',
    ...top5.map((p,i)=>`${i+1}. ${p.name} — ${p.qty%1===0?p.qty:p.qty.toFixed(1)} pcs`),
    '',
    '*Monthly Revenue:*',
    ...activeMonths.map(m=>{
      const v=c.monthly[m]||0;
      return `${m}: ${fmtShort(v)}`;
    }),
    '','MKU & MKS Sales App'
  ];
  window.open('https://wa.me/?text='+encodeURIComponent(lines.join('\n')),'_blank');
}

// ════════════════
// COMPETITOR INTEL
// ════════════════
let _intelLogs = [];
let _intelQuery = '';

function initIntel() {
  const el = document.getElementById('intel-list');
  if (!el) return;
  el.innerHTML = `<div class="cust-loading">
    <div class="cust-loading-spinner"></div>
    <div class="cust-loading-txt">Loading competitor intel…</div>
  </div>`;
  waitForGlobal('CompetitorIntel')
    .then(() => window.CompetitorIntel.fetchLogs())
    .then(logs => { _intelLogs = logs; renderIntelList(); })
    .catch(e => {
      console.error('fetchLogs error:', e);
      el.innerHTML = `<div class="cust-empty">Couldn't load competitor intel.<br><span style="font-size:.7rem;opacity:.6">${e.message||e}</span></div>`;
    });
  initDeals();
}

function onIntelSearch(v) { _intelQuery = v.trim().toLowerCase(); renderIntelList(); }

let _intelView = 'recent'; // 'recent' | 'summary' | 'deals'
function switchIntelView(view, btn) {
  _intelView = view;
  document.querySelectorAll('.intel-view-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('intel-fab-price')?.classList.toggle('hidden', view === 'deals');
  document.getElementById('intel-fab-deal')?.classList.toggle('hidden', view !== 'deals');
  renderIntelList();
}

function _filteredIntelLogs() {
  const q = _intelQuery;
  return q
    ? _intelLogs.filter(r => (r.competitor_name||'').toLowerCase().includes(q) || (r.product||'').toLowerCase().includes(q))
    : _intelLogs;
}

function renderIntelList() {
  if (_intelView === 'summary') { renderIntelSummary(); return; }
  if (_intelView === 'deals') { renderDealsList(); return; }
  const el = document.getElementById('intel-list');
  if (!el) return;
  const q = _intelQuery;
  const rows = _filteredIntelLogs();
  if (!rows.length) {
    el.innerHTML = `<div class="pl-no-results"><div class="e">${uiIcon('search',32)}</div><p>${q ? 'No matching entries' : 'No competitor intel logged yet'}</p></div>`;
    return;
  }
  el.innerHTML = rows.map(r => {
    const repName = r.reps ? r.reps.name : 'Unknown';
    const dt = new Date(r.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'2-digit' });
    return `<div class="intel-card">
      <div class="intel-card-top">
        ${r.photo_url ? `<img class="intel-card-photo" src="${escHtml(r.photo_url)}" alt="" onclick="window.open('${escHtml(r.photo_url)}','_blank')">` : ''}
        <div class="intel-card-info">
          <div class="intel-card-competitor">${escHtml(r.competitor_name)}</div>
          <div class="intel-card-product">${escHtml(r.product)}${r.category ? ' · '+escHtml(r.category) : ''}</div>
        </div>
        <div class="intel-card-price">
          <div class="intel-card-price-val">${fmtShort(r.price)}</div>
          <div class="intel-card-price-unit">${escHtml(r.unit)}</div>
        </div>
      </div>
      ${r.customer_name ? `<div class="intel-card-customer">${escHtml(r.customer_name)}</div>` : ''}
      ${r.notes ? `<div class="intel-card-notes">${escHtml(r.notes)}</div>` : ''}
      <div class="intel-card-foot">
        ${avatarHtml(repName, repColorByName(repName), 20)}
        <span class="intel-card-rep">${escHtml(repName)}</span>
        <span class="intel-card-date">${dt}</span>
        ${(r.rep_id === currentRep?.repId || currentRep?.isSuperAdmin) ? `
        <span class="intel-card-actions">
          <button onclick='openIntelForm(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button onclick="deleteIntelLogConfirm('${r.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>
          </button>
        </span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderIntelSummary() {
  const el = document.getElementById('intel-list');
  if (!el) return;
  const rows = _filteredIntelLogs();
  if (!rows.length) {
    el.innerHTML = `<div class="pl-no-results"><div class="e">${uiIcon('search',32)}</div><p>${_intelQuery ? 'No matching entries' : 'No competitor intel logged yet'}</p></div>`;
    return;
  }
  const byCompetitor = {};
  rows.forEach(r => {
    (byCompetitor[r.competitor_name] ||= []).push(r);
  });
  const competitors = Object.entries(byCompetitor).sort((a,b) => b[1].length - a[1].length);

  el.innerHTML = competitors.map(([name, entries]) => {
    const byProduct = {};
    entries.forEach(r => (byProduct[r.product] ||= []).push(r.price));
    const products = Object.entries(byProduct).sort((a,b) => b[1].length - a[1].length).slice(0, 5);
    const productRows = products.map(([prod, prices]) => {
      const min = Math.min(...prices), max = Math.max(...prices);
      const priceStr = min === max ? fmtShort(min) : `${fmtShort(min)}–${fmtShort(max)}`;
      return `<div class="intel-sum-row">
        <span class="intel-sum-prod">${escHtml(prod)}</span>
        <span class="intel-sum-price">${priceStr}</span>
      </div>`;
    }).join('');
    return `<div class="intel-card">
      <div class="intel-sum-head">
        <div class="intel-card-competitor">${escHtml(name)}</div>
        <span class="intel-sum-count">${entries.length} ${entries.length===1?'entry':'entries'}</span>
      </div>
      ${productRows}
    </div>`;
  }).join('');
}

let _editingIntelLogId = null;
let _intelPhotoFile = null;
let _intelExistingPhotoUrl = null;

function _renderIntelPhotoPreview(url) {
  const el = document.getElementById('intel-photo-preview');
  if (!el) return;
  el.innerHTML = url ? `<img src="${escHtml(url)}" alt="">` : '';
}

function openIntelForm(log) {
  _editingIntelLogId = log ? log.id : null;
  _intelPhotoFile = null;
  _intelExistingPhotoUrl = log ? (log.photo_url || null) : null;
  document.getElementById('intel-form-title').textContent = log ? 'Edit Competitor Price' : 'Log Competitor Price';
  document.getElementById('intel-competitor').value = log ? log.competitor_name : '';
  document.getElementById('intel-product').value = log ? log.product : '';
  document.getElementById('intel-category').value = log ? (log.category || '') : '';
  document.getElementById('intel-price').value = log ? log.price : '';
  document.getElementById('intel-unit').value = log ? log.unit : '';
  document.getElementById('intel-customer').value = log ? (log.customer_name || '') : '';
  document.getElementById('intel-notes').value = log ? (log.notes || '') : '';
  document.getElementById('intel-photo-input').value = '';
  _renderIntelPhotoPreview(_intelExistingPhotoUrl);
  document.getElementById('intel-form-error').innerHTML = '&nbsp;';
  document.getElementById('intel-form-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function onIntelPhotoSelected(file) {
  if (!file) return;
  _intelPhotoFile = file;
  _renderIntelPhotoPreview(URL.createObjectURL(file));
}

function closeIntelForm(e) {
  if (!e || e.target === document.getElementById('intel-form-overlay')) {
    document.getElementById('intel-form-overlay').classList.add('hidden');
    document.body.style.overflow = '';
    _editingIntelLogId = null;
    _intelPhotoFile = null;
  }
}

async function submitIntelForm() {
  const val = id => document.getElementById(id).value.trim();
  const competitor_name = val('intel-competitor');
  const product = val('intel-product');
  const category = val('intel-category');
  const priceRaw = val('intel-price');
  const unit = val('intel-unit');
  const customer_name = val('intel-customer');
  const notes = val('intel-notes');
  const errEl = document.getElementById('intel-form-error');

  if (!competitor_name || !product || !priceRaw || !unit) {
    errEl.textContent = 'Competitor name, product, price, and unit are required.';
    return;
  }
  const price = parseFloat(priceRaw);
  if (isNaN(price) || price <= 0) {
    errEl.textContent = 'Enter a valid price.';
    return;
  }

  errEl.innerHTML = '&nbsp;';
  try {
    await waitForGlobal('CompetitorIntel');
    let logId = _editingIntelLogId;
    if (_editingIntelLogId) {
      await window.CompetitorIntel.updateLog(_editingIntelLogId, {
        competitor_name, product,
        category: category || null,
        price, unit,
        customer_name: customer_name || null,
        notes: notes || null,
      });
    } else {
      const row = await window.CompetitorIntel.createLog({
        rep_id: currentRep.repId,
        competitor_name, product,
        category: category || null,
        price, unit,
        customer_name: customer_name || null,
        notes: notes || null,
      });
      logId = row.id;
    }
    if (_intelPhotoFile && logId) {
      const photoUrl = await window.CompetitorIntel.uploadPhoto(currentRep.repId, logId, _intelPhotoFile);
      await window.CompetitorIntel.updateLog(logId, { photo_url: photoUrl });
    }
    closeIntelForm();
    showToast(_editingIntelLogId ? 'Competitor price updated' : 'Competitor price logged');
    initIntel();
  } catch (e) {
    if (window.WriteQueue && window.WriteQueue.isOfflineError(e)) {
      const fields = { competitor_name, product, category: category || null, price, unit, customer_name: customer_name || null, notes: notes || null };
      await window.WriteQueue.enqueue(_editingIntelLogId
        ? { type: 'intel-update', payload: { id: _editingIntelLogId, fields, rep_id: currentRep.repId }, blob: _intelPhotoFile || null }
        : { type: 'intel-create', payload: { rep_id: currentRep.repId, ...fields }, blob: _intelPhotoFile || null });
      closeIntelForm();
      showToast('Saved offline — will sync when back online', 4500);
      return;
    }
    console.error('createLog error:', e);
    errEl.textContent = 'Could not save — ' + (e.message || e);
  }
}

async function deleteIntelLogConfirm(id) {
  if (!await confirmDialog('Delete this competitor price entry?')) return;
  try {
    await waitForGlobal('CompetitorIntel');
    await window.CompetitorIntel.deleteLog(id);
    showToast('Entry deleted');
    initIntel();
  } catch (e) {
    if (window.WriteQueue && window.WriteQueue.isOfflineError(e)) {
      await window.WriteQueue.enqueue({ type: 'intel-delete', payload: { id } });
      showToast('Will delete once back online', 4500);
      return;
    }
    console.error('deleteLog error:', e);
    alert('Could not delete — ' + (e.message || e));
  }
}

// ════════════════
// DEALS (deal / keep-stock requests)
// ════════════════
let _deals = [];
let _dealSelectedProduct = null;

function initDeals() {
  waitForGlobal('Deals')
    .then(() => window.Deals.fetchDeals())
    .then(deals => {
      _deals = deals;
      if (_intelView === 'deals') renderDealsList();
      _updateDealsBadge();
    })
    .catch(e => console.error('fetchDeals error:', e));
}

function _filteredDeals() {
  const q = _intelQuery;
  return q
    ? _deals.filter(d => (d.product_name||'').toLowerCase().includes(q) || (d.customer_name||'').toLowerCase().includes(q))
    : _deals;
}

const DEAL_STATUS_LABEL = { pending: 'Pending', held: 'Held', fulfilled: 'Fulfilled', declined: 'Declined' };

function _dealStatusActionsHtml(r) {
  const isOwner = r.rep_id === currentRep?.repId;
  const isAdmin = currentRep?.isManager || currentRep?.isSuperAdmin;
  if (!isOwner && !isAdmin) return '';
  const next = { pending: isAdmin ? ['held', 'declined'] : ['declined'], held: isAdmin ? ['fulfilled', 'declined'] : [] }[r.status] || [];
  if (!next.length) return '';
  return `<span class="deal-actions">${next.map(s => `<button class="deal-action-btn ${s}" onclick="updateDealStatus('${r.id}','${s}')">${DEAL_STATUS_LABEL[s]}</button>`).join('')}</span>`;
}

function renderDealsList() {
  const el = document.getElementById('intel-list');
  if (!el) return;
  const rows = _filteredDeals();
  if (!rows.length) {
    el.innerHTML = `<div class="pl-no-results"><div class="e">${uiIcon('search',32)}</div><p>${_intelQuery ? 'No matching deals' : 'No deals logged yet'}</p></div>`;
    return;
  }
  el.innerHTML = rows.map(r => {
    const repName = r.reps ? r.reps.name : 'Unknown';
    const dt = new Date(r.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'2-digit' });
    return `<div class="intel-card">
      <div class="intel-card-top">
        <div class="intel-card-info">
          <div class="intel-card-competitor">${escHtml(r.product_name)}</div>
          <div class="intel-card-product">${escHtml(r.customer_name)} · Qty ${r.quantity}</div>
        </div>
        <div class="intel-card-price">
          ${r.agreed_price ? `<div class="intel-card-price-val">${fmtShort(r.agreed_price)}</div>` : ''}
          <span class="deal-status-pill ${r.status}">${DEAL_STATUS_LABEL[r.status]}</span>
        </div>
      </div>
      ${r.discount_note ? `<div class="intel-card-customer">${escHtml(r.discount_note)}</div>` : ''}
      ${r.reason ? `<div class="intel-card-notes">${escHtml(r.reason)}</div>` : ''}
      <div class="intel-card-foot">
        ${avatarHtml(repName, repColorByName(repName), 20)}
        <span class="intel-card-rep">${escHtml(repName)}</span>
        <span class="intel-card-date">${dt}</span>
        ${_dealStatusActionsHtml(r)}
      </div>
    </div>`;
  }).join('');
}

function _updateDealsBadge() {
  const badge = document.getElementById('deals-badge');
  if (!badge) return;
  const isAdmin = !!(currentRep?.isManager || currentRep?.isSuperAdmin);
  const n = isAdmin ? _deals.filter(d => d.status === 'pending').length : 0;
  if (n > 0) { badge.textContent = n; badge.style.display = 'flex'; }
  else { badge.style.display = 'none'; }
}

function onDealProductSearch(v) {
  _dealSelectedProduct = null;
  document.getElementById('deal-stock-info').innerHTML = '';
  const q = v.trim().toLowerCase();
  const resultsEl = document.getElementById('deal-product-results');
  if (!q) { resultsEl.innerHTML = ''; resultsEl.classList.add('hidden'); return; }
  const matches = PRODUCTS.filter(p =>
    p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
  ).slice(0, 8);
  resultsEl.innerHTML = matches.length
    ? matches.map(p => `<div class="deal-product-row" onclick='selectDealProduct(${JSON.stringify(p.id)})'>${escHtml(p.name)}</div>`).join('')
    : `<div class="deal-product-row deal-product-empty">No matches</div>`;
  resultsEl.classList.remove('hidden');
}

function selectDealProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  _dealSelectedProduct = p;
  document.getElementById('deal-product-inp').value = p.name;
  document.getElementById('deal-product-results').innerHTML = '';
  document.getElementById('deal-product-results').classList.add('hidden');
  const stock = findStockForProduct(p);
  document.getElementById('deal-stock-info').innerHTML = stock
    ? `Live stock: <b>${stock.saldo ?? '—'} ${escHtml(stock.unit||'')}</b>${stock.st ? ' · ' + escHtml(stock.st.toUpperCase()) : ''}`
    : 'No live stock data found for this product.';
}

function openDealForm() {
  _dealSelectedProduct = null;
  document.getElementById('deal-product-inp').value = '';
  document.getElementById('deal-product-results').innerHTML = '';
  document.getElementById('deal-product-results').classList.add('hidden');
  document.getElementById('deal-stock-info').innerHTML = '';
  document.getElementById('deal-customer').value = '';
  document.getElementById('deal-qty').value = '';
  document.getElementById('deal-price').value = '';
  document.getElementById('deal-discount').value = '';
  document.getElementById('deal-reason').value = '';
  document.getElementById('deal-form-error').innerHTML = '&nbsp;';
  document.getElementById('deal-form-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeDealForm(e) {
  if (!e || e.target === document.getElementById('deal-form-overlay')) {
    document.getElementById('deal-form-overlay').classList.add('hidden');
    document.body.style.overflow = '';
    _dealSelectedProduct = null;
  }
}

async function submitDealForm() {
  const val = id => document.getElementById(id).value.trim();
  const customer_name = val('deal-customer');
  const qtyRaw = val('deal-qty');
  const priceRaw = val('deal-price');
  const discount_note = val('deal-discount');
  const reason = val('deal-reason');
  const errEl = document.getElementById('deal-form-error');

  if (!_dealSelectedProduct || !customer_name || !qtyRaw) {
    errEl.textContent = 'Product, customer, and quantity are required.';
    return;
  }
  const quantity = parseFloat(qtyRaw);
  if (isNaN(quantity) || quantity <= 0) {
    errEl.textContent = 'Enter a valid quantity.';
    return;
  }
  let agreed_price = null;
  if (priceRaw) {
    agreed_price = parseFloat(priceRaw);
    if (isNaN(agreed_price) || agreed_price <= 0) {
      errEl.textContent = 'Enter a valid price.';
      return;
    }
  }

  errEl.innerHTML = '&nbsp;';
  const fields = {
    product_id: _dealSelectedProduct.id, product_name: _dealSelectedProduct.name,
    customer_name, quantity, agreed_price,
    discount_note: discount_note || null, reason: reason || null,
  };
  try {
    await waitForGlobal('Deals');
    await window.Deals.createDeal({ rep_id: currentRep.repId, ...fields });
    closeDealForm();
    showToast('Deal request submitted');
    initDeals();
  } catch (e) {
    if (window.WriteQueue && window.WriteQueue.isOfflineError(e)) {
      await window.WriteQueue.enqueue({ type: 'deal-create', payload: { rep_id: currentRep.repId, ...fields } });
      closeDealForm();
      showToast('Saved offline — will sync when back online', 4500);
      return;
    }
    console.error('createDeal error:', e);
    errEl.textContent = 'Could not save — ' + (e.message || e);
  }
}

async function updateDealStatus(id, status) {
  try {
    await waitForGlobal('Deals');
    await window.Deals.updateDealStatus(id, status);
    showToast('Deal marked ' + DEAL_STATUS_LABEL[status]);
    initDeals();
  } catch (e) {
    if (window.WriteQueue && window.WriteQueue.isOfflineError(e)) {
      await window.WriteQueue.enqueue({ type: 'deal-status', payload: { id, status } });
      showToast('Will update once back online', 4500);
      return;
    }
    console.error('updateDealStatus error:', e);
    alert('Could not update — ' + (e.message || e));
  }
}

// ════════════════
// CUSTOMER CONTACTS + VISIT NOTES
// ════════════════
let _custRelationsToken = 0;

async function loadCustRelations(name, area) {
  const myToken = ++_custRelationsToken;
  const contactsEl = document.getElementById('cm-contacts');
  const visitsEl = document.getElementById('cm-visits');
  contactsEl.innerHTML = '<div class="cust-loading"><div class="cust-loading-spinner"></div></div>';
  visitsEl.innerHTML = '';
  try {
    await waitForGlobal('CustomerIdentity');
    const customerId = await window.CustomerIdentity.getOrCreateCustomerId(name, area);
    if (myToken !== _custRelationsToken) return; // a different customer was opened meanwhile
    _custModalCustomerId = customerId;

    await waitForGlobal('CustomerRelations');
    const [contacts, visits] = await Promise.all([
      window.CustomerRelations.fetchContacts(customerId),
      window.CustomerRelations.fetchVisits(customerId),
    ]);
    if (myToken !== _custRelationsToken) return; // stale response, discard
    renderCustContacts(contacts);
    renderCustVisits(visits);
  } catch (e) {
    if (myToken !== _custRelationsToken) return;
    console.error('loadCustRelations error:', e);
    contactsEl.innerHTML = `<div class="cust-empty">Couldn't load contacts/notes.</div>`;
    visitsEl.innerHTML = '';
  }
}

function renderCustContacts(contacts) {
  const el = document.getElementById('cm-contacts');
  if (!contacts.length) { el.innerHTML = '<div class="cm-empty-note">No contacts yet</div>'; return; }
  el.innerHTML = contacts.map(c => `
    <div class="cm-contact-card">
      <div class="cm-contact-info">
        <div class="cm-contact-name">${escHtml(c.name)}</div>
        <div class="cm-contact-meta">${[c.role, c.phone].filter(Boolean).map(escHtml).join(' · ')}</div>
      </div>
      <div class="cm-contact-actions">
        <button onclick='openContactForm(${JSON.stringify(c).replace(/'/g, "&#39;")})'>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button onclick="deleteContactConfirm('${c.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>
        </button>
      </div>
    </div>`).join('');
}

function renderCustVisits(visits) {
  const el = document.getElementById('cm-visits');
  if (!visits.length) { el.innerHTML = '<div class="cm-empty-note">No visit notes yet</div>'; return; }
  el.innerHTML = visits.map(v => {
    const repName = v.reps ? v.reps.name : 'Unknown';
    const dt = new Date(v.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'2-digit' });
    return `<div class="cm-visit-card">
      <div class="cm-visit-note">${escHtml(v.note)}</div>
      <div class="cm-visit-foot">
        ${avatarHtml(repName, repColorByName(repName), 18)}
        <span class="cm-visit-rep">${escHtml(repName)}</span>
        <span class="cm-visit-date">${dt}</span>
        ${currentRep?.isSuperAdmin ? `
        <span class="intel-card-actions">
          <button onclick='openVisitForm(${JSON.stringify(v).replace(/'/g, "&#39;")})'>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button onclick="deleteVisitConfirm('${v.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>
          </button>
        </span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openContactForm(contact) {
  _editingContactId = contact ? contact.id : null;
  document.getElementById('contact-form-title').textContent = contact ? 'Edit Contact' : 'Add Contact';
  document.getElementById('contact-name').value = contact ? contact.name : '';
  document.getElementById('contact-role').value = contact ? (contact.role || '') : '';
  document.getElementById('contact-phone').value = contact ? (contact.phone || '') : '';
  document.getElementById('contact-form-error').innerHTML = '&nbsp;';
  document.getElementById('contact-form-overlay').classList.remove('hidden');
}

function closeContactForm(e) {
  if (!e || e.target === document.getElementById('contact-form-overlay')) {
    document.getElementById('contact-form-overlay').classList.add('hidden');
    _editingContactId = null;
  }
}

async function submitContactForm() {
  const name = document.getElementById('contact-name').value.trim();
  const role = document.getElementById('contact-role').value.trim();
  const phone = document.getElementById('contact-phone').value.trim();
  const errEl = document.getElementById('contact-form-error');
  if (!name) { errEl.textContent = 'Name is required.'; return; }

  errEl.innerHTML = '&nbsp;';
  try {
    await waitForGlobal('CustomerRelations');
    if (_editingContactId) {
      await window.CustomerRelations.updateContact(_editingContactId, {
        name, role: role || null, phone: phone || null, updated_at: new Date().toISOString(),
      });
    } else {
      await window.CustomerRelations.createContact({
        customer_id: _custModalCustomerId, rep_id: currentRep.repId,
        name, role: role || null, phone: phone || null,
      });
    }
    closeContactForm();
    showToast(_editingContactId ? 'Contact updated' : 'Contact added');
    const contacts = await window.CustomerRelations.fetchContacts(_custModalCustomerId);
    renderCustContacts(contacts);
  } catch (e) {
    if (window.WriteQueue && window.WriteQueue.isOfflineError(e)) {
      await window.WriteQueue.enqueue(_editingContactId
        ? { type: 'contact-update', payload: { id: _editingContactId, fields: { name, role: role || null, phone: phone || null, updated_at: new Date().toISOString() } } }
        : { type: 'contact-create', payload: { customer_id: _custModalCustomerId, rep_id: currentRep.repId, name, role: role || null, phone: phone || null } });
      closeContactForm();
      showToast('Saved offline — will sync when back online', 4500);
      return;
    }
    console.error('submitContactForm error:', e);
    errEl.textContent = 'Could not save — ' + (e.message || e);
  }
}

async function deleteContactConfirm(id) {
  if (!await confirmDialog('Delete this contact?')) return;
  try {
    await waitForGlobal('CustomerRelations');
    await window.CustomerRelations.deleteContact(id);
    showToast('Contact deleted');
    const contacts = await window.CustomerRelations.fetchContacts(_custModalCustomerId);
    renderCustContacts(contacts);
  } catch (e) {
    if (window.WriteQueue && window.WriteQueue.isOfflineError(e)) {
      await window.WriteQueue.enqueue({ type: 'contact-delete', payload: { id } });
      showToast('Will delete once back online', 4500);
      return;
    }
    console.error('deleteContact error:', e);
    showToast("Couldn't delete contact");
  }
}

let _editingVisitId = null;

// Called with no args to add a new note, or a visit row (Super Admin edit
// pencil) to edit an existing one — same modal for both, like contacts.
function openVisitForm(visit) {
  _editingVisitId = visit ? visit.id : null;
  document.getElementById('visit-form-title').textContent = visit ? 'Edit Visit Note' : 'Add Visit Note';
  document.getElementById('visit-note').value = visit ? visit.note : '';
  document.getElementById('visit-form-error').innerHTML = '&nbsp;';
  document.getElementById('visit-form-overlay').classList.remove('hidden');
}

function closeVisitForm(e) {
  if (!e || e.target === document.getElementById('visit-form-overlay')) {
    document.getElementById('visit-form-overlay').classList.add('hidden');
    _editingVisitId = null;
  }
}

async function submitVisitForm() {
  const note = document.getElementById('visit-note').value.trim();
  const errEl = document.getElementById('visit-form-error');
  if (!note) { errEl.textContent = 'Note cannot be empty.'; return; }

  errEl.innerHTML = '&nbsp;';
  try {
    await waitForGlobal('CustomerRelations');
    if (_editingVisitId) {
      await window.CustomerRelations.updateVisit(_editingVisitId, note);
    } else {
      await window.CustomerRelations.createVisit({
        customer_id: _custModalCustomerId, rep_id: currentRep.repId, note,
      });
    }
    const wasEdit = !!_editingVisitId;
    closeVisitForm();
    showToast(wasEdit ? 'Visit note updated' : 'Visit note added');
    const visits = await window.CustomerRelations.fetchVisits(_custModalCustomerId);
    renderCustVisits(visits);
  } catch (e) {
    if (window.WriteQueue && window.WriteQueue.isOfflineError(e)) {
      await window.WriteQueue.enqueue({ type: 'visit-create', payload: { customer_id: _custModalCustomerId, rep_id: currentRep.repId, note } });
      closeVisitForm();
      showToast('Saved offline — will sync when back online', 4500);
      return;
    }
    console.error('submitVisitForm error:', e);
    errEl.textContent = 'Could not save — ' + (e.message || e);
  }
}

async function deleteVisitConfirm(id) {
  if (!await confirmDialog('Delete this visit note?')) return;
  try {
    await waitForGlobal('CustomerRelations');
    await window.CustomerRelations.deleteVisit(id);
    showToast('Visit note deleted');
    const visits = await window.CustomerRelations.fetchVisits(_custModalCustomerId);
    renderCustVisits(visits);
  } catch (e) {
    console.error('deleteVisit error:', e);
    showToast("Couldn't delete visit note");
  }
}
