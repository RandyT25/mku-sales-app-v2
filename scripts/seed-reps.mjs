// One-time seed script: creates a Supabase Auth user (email=login_alias,
// password=PIN) + a `reps` row for each of the 14 field reps plus the
// dedicated "Manager" login (is_manager: true, Phase 7).
//
// Run locally, never in CI:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-reps.mjs
//
// Before running: fill in real 6-digit PINs in scripts/seed-reps.local.mjs
// (gitignored, never commit real PINs). Supabase's Auth minimum password
// length defaults to 6, which is also the app's PIN length, so no dashboard
// change is needed.
//
// Safely re-runnable — skips any rep that already has a `reps` row.

import { deriveLoginAlias } from '../lib/rep-alias.js';
import { PINS } from './seed-reps.local.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

// Kept in sync manually with REP_CONFIG in lib/app-core.js — not imported
// directly since app-core.js is a browser-only, DOM-dependent global-scope
// file not safely importable into Node.
const REPS = [
  { name: 'Picrom',         area: 'UBUD' },
  { name: 'I Made Luih',    area: 'DENPASAR - SANUR' },
  { name: 'Juni',           area: 'KUTA SEL - ULUWATU' },
  { name: 'Lani',           area: 'KUTA - INDUSTRI / HOTEL' },
  { name: 'Monica',         area: 'KUTA SEL - NUSA DUA' },
  { name: 'Sujana',         area: 'SEMINYAK' },
  { name: 'Eka',            area: 'KUTA - LEGIAN' },
  { name: 'Taufik',         area: 'CANGGU 1' },
  { name: 'Dewi Kristiani', area: 'CANGGU 2' },
  { name: 'Wira',           area: 'GT + FOODY' },
  { name: 'Sriasih',        area: 'MODERN + GT' },
  { name: 'Ridwan',         area: 'NP-1 (Nestlé)' },
  { name: 'Redi',           area: 'NP-2 (Nestlé)' },
  { name: 'Gek Mas',        area: 'NP-3 (Nestlé)' },
  { name: 'Manager',        area: 'Management', is_manager: true },
  { name: 'Bisdev Food',      area: 'Company-wide (Food)',      bisdev_category: 'food' },
  { name: 'Bisdev Beverage',  area: 'Company-wide (Beverage)',  bisdev_category: 'beverage' },
];

const headers = {
  'Content-Type': 'application/json',
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

async function repExists(name) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/reps?name=eq.${encodeURIComponent(name)}&select=id`,
    { headers }
  );
  if (!res.ok) throw new Error(`reps lookup failed (${res.status}): ${await res.text()}`);
  const rows = await res.json();
  return rows.length > 0;
}

async function createAuthUser(email, password, displayName) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true, // must not go through public sign-up (unreachable .internal address)
      user_metadata: { display_name: displayName },
    }),
  });
  if (!res.ok) throw new Error(`auth user create failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.id ?? data.user?.id;
}

async function createRepRow({ name, login_alias, auth_user_id, is_nestle, is_manager, bisdev_category }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reps`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      name,
      login_alias,
      auth_user_id,
      is_nestle,
      is_manager: !!is_manager,
      bisdev_category: bisdev_category || null,
      active: true,
    }),
  });
  if (!res.ok) throw new Error(`reps insert failed (${res.status}): ${await res.text()}`);
}

for (const rep of REPS) {
  const pin = PINS[rep.name];
  if (!pin) {
    console.error(`✗ ${rep.name}: no PIN set in scripts/seed-reps.local.mjs, skipping`);
    continue;
  }
  try {
    if (await repExists(rep.name)) {
      console.log(`- ${rep.name}: already seeded, skipping`);
      continue;
    }
    const alias = deriveLoginAlias(rep.name);
    const authUserId = await createAuthUser(alias, pin, rep.name);
    await createRepRow({
      name: rep.name,
      login_alias: alias,
      auth_user_id: authUserId,
      is_nestle: rep.area.includes('Nestlé'),
      is_manager: rep.is_manager,
      bisdev_category: rep.bisdev_category,
    });
    console.log(`✓ ${rep.name} (${alias})`);
  } catch (e) {
    console.error(`✗ ${rep.name}: ${e.message}`);
  }
}
