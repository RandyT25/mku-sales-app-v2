// Regenerates data/stock_map.js (product ID -> warehouse code bridge) from
// the live stock feed. STOCK_MAP is a pure optimization layer over the same
// fuzzy name-matching the app already falls back to when a mapping is
// missing (see findStockForProduct() in lib/app-core.js) — this script just
// runs that same matching once, offline, across every product, instead of
// the current hand-generated file that only covers a subset.
//
// Run: node scripts/regen-stock-map.mjs
// (No secrets needed — the Dashboard repo's GitHub Pages output is public.)

import { readFile, writeFile } from 'node:fs/promises';

const DATA_URL = 'https://randyt25.github.io/MKU-MKS-Area-Dashboard/data_sales.js';
const PRODUCTS_PATH = new URL('../data/products.js', import.meta.url);
const STOCK_MAP_PATH = new URL('../data/stock_map.js', import.meta.url);

function extractConstArray(src, varName) {
  const m = src.match(new RegExp(`^const ${varName} = ([\\s\\S]*);\\s*$`));
  if (!m) throw new Error(`Could not find "const ${varName} = ..." in source`);
  return JSON.parse(m[1]);
}

// Mirrors findStockForProduct()'s fallback tiers (lib/app-core.js) — no
// prior-map step here since we're building the map fresh.
function matchProduct(p, divStock) {
  const pn = p.name.toLowerCase();
  return divStock.find(x => x.name && x.name.toLowerCase().includes(pn))
    || divStock.find(x => x.name && x.name.toLowerCase().includes(pn.slice(0, 30)))
    || divStock.find(x => x.name && x.name.toLowerCase().includes(pn.slice(0, 20)));
}

async function main() {
  console.log('Fetching live stock feed...');
  const resp = await fetch(DATA_URL, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
  const RAW = extractConstArray(await resp.text(), 'RAW');

  const productsSrc = await readFile(PRODUCTS_PATH, 'utf8');
  const PRODUCTS = extractConstArray(productsSrc, 'PRODUCTS');

  const latest = RAW.latest;
  const snap = RAW.stock_by_date?.[latest];
  if (!snap) throw new Error(`No stock_by_date entry for latest date ${latest}`);
  const stockByDiv = {
    MKU: snap.MKU_full || snap.MKU || [],
    MKS: snap.MKS_full || snap.MKS || [],
  };

  const map = {};
  let matched = 0;
  for (const p of PRODUCTS) {
    const hit = matchProduct(p, stockByDiv[p.division] || []);
    if (!hit) continue;
    matched++;
    map[p.id] = {
      code: hit.code,
      saldo: hit.saldo,
      unit: hit.unit,
      st: hit.st,
      name: hit.name,
      buf: hit.buf,
    };
  }

  console.log(`Matched ${matched}/${PRODUCTS.length} products (was covering a subset before).`);

  const out = 'const STOCK_MAP = ' + JSON.stringify(map) + ';\n';
  await writeFile(STOCK_MAP_PATH, out, 'utf8');
  console.log(`Wrote ${STOCK_MAP_PATH.pathname}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
