# mku-sales-app-v2 — Living Architecture & Decisions Doc

Mirrors the role of `mku-sales-app_brain.md` in v1 — read this first in any new session working on this repo.

## What this is

V2 of the MKU/MKS sales team PWA, built as a **completely separate project** from `RandyT25/mku-sales-app` (v1, live/production, used daily by ~14 field reps). V2 must never modify v1 or the `MKU-MKS-Area-Dashboard` pipeline repo — those are read-only references.

Live at: **`randyt25.github.io/mku-sales-app-v2`**

Full architecture reasoning and the original milestone spec live in the approved plan this repo was scaffolded from — see git history / ask for the plan doc if context is needed on *why* a decision was made, not just *what*.

## Architecture decisions (confirmed)

- **Backend: Supabase** (Postgres + Auth + Storage) for new write-heavy data — competitor price logs, customer contacts/visit notes, order drafts, canonical customer identity. Chosen over Firebase/Firestore because the milestone-1 features are relational/aggregate-query-shaped (filter by product × area, manager rollups), which Postgres fits naturally and NoSQL fights. Chosen over Cloudflare D1 because Supabase's built-in Auth/Storage/Studio (browser table editor) matter a lot for a solo maintainer who tests exclusively on his phone, not locally.
- **Auth: per-rep PIN.** Pick your name (like v1's dropdown), enter a short PIN. v1 had *zero* real authentication (just a name dropdown + `localStorage` remembering the last selection) — this is the first time the app has real identity, which write-heavy Supabase tables require for RLS.
- **Data visibility: team-wide.** Any rep can see any other rep's competitor logs and visit notes — maximizes intel-sharing value. Management sees everything via an `is_manager` flag on the `reps` table.
- **Offline: writes require a live connection, for now.** No local write-queue/sync in this first backend-backed milestone — revisit only if field connectivity proves to be a real recurring problem.
- **Read-only reference data is NOT duplicated into Postgres.** Targets, stock, SO/order history, and revenue-based customer data keep coming straight from the same Dashboard-repo feed v1 uses (`data_sales.js`, `customers.js`, daily FJ Excel files). Postgres only owns genuinely new data.
- **`products.js` / `toolkit.js` / `announcements.js` are forked once from v1**, not kept in ongoing sync — these are static files local to the v1 app repo (not part of the Dashboard feed), so v2 maintains its own copy independently going forward.

## Phase 0 status: scaffolded, not yet deployed

What exists as of this session:
- Full repo skeleton per the plan (`data/`, `lib/`, `features/`, `styles/`, `supabase/`, `.github/workflows/`).
- Static content forked from v1: `data/products.js`, `data/toolkit.js`, `data/announcements.js`, `data/stock_map.js`, icons, logo, favicon, both catalog PDFs.
- `styles/app.css` — direct 1:1 copy of v1's `sales.css` (design tokens, card pattern, hero header, bottom-nav, bottom-sheet modals all preserved).
- `manifest.json` — adapted for the new scope (`/mku-sales-app-v2/`), icon paths updated to `icons/`.
- `sw.js` — copied verbatim from v1 (deliberately disabled/no-cache — v1 has zero offline story by design, after an earlier caching bug caused stale-data confusion; keeping that behavior until there's a specific reason to change it).
- `index.html` — copied from v1 with **only file-path substitutions** (verified via `diff` — no content lost): CSS/script paths updated to the new `data/`/`styles/`/`lib/` layout, title and login label tagged "V2" so Randy can visually tell the two apps apart when testing both on his phone.

### Deliberate deviation from the original plan's file layout

The plan proposed splitting `sales.js`'s logic into one file per feature under `features/` (`target.js`, `pricelist.js`, `stock.js`, etc.) from the start. **I did not do that split yet.** Instead, `sales.js` (2264 lines) was ported **as a single file, `lib/app-core.js`, unchanged**, and `index.html`'s bootstrap script was updated to load it from its new path.

**Why:** manually re-splitting 2264 lines of interdependent global state and functions in one pass is exactly the kind of mechanical, hard-to-fully-verify transcription work that's easy to introduce a subtle bug in — dropping a function, missing a global reference, breaking an implicit ordering dependency — without a way to catch it except by exhaustively re-testing every screen. Since Phase 0's actual goal is proving the new repo/deploy/manifest setup works and matches v1 exactly, keeping the ported logic as one verified-identical file achieves that goal with far less risk than a big-bang refactor would.

**The plan going forward:** split `app-core.js` into `features/*.js` incrementally, **one module at a time, only when that feature is actually being touched** for a new Supabase-backed capability (e.g., when building the order-builder upgrade in Phase 5, extract just the order-builder logic into `features/order-builder.js` at that point, verify it still works, then move on). This spreads the refactor risk across many small, individually-verifiable steps instead of one large one, and means nothing gets refactored before there's a real reason to touch it.

## Phase 0: DONE — live and verified

- Repo created: `RandyT25/mku-sales-app-v2` (public, matches v1).
- GitHub Pages live at **`https://randyt25.github.io/mku-sales-app-v2/`**.
- Verified in-browser against the live URL (not just local): Target screen (hero %, milestone bars, pace color/tag), Pricelist (348 MKU / 223 MKS products, categories, prices), Stock (live counts: In Stock/Low/Critical/Out), and Toolkit (catalogs, correct page counts) all render correctly with real data from the same Dashboard feed v1 uses.

**Fixed:** v1 and v2 are both hosted on the `randyt25.github.io` origin (different paths), so `localStorage` is shared cross-path there. v2 uses its own `mkuv2_saved_rep` key (not v1's `mku_saved_rep`), so the two apps no longer bleed into each other's last-selected rep.

## Design refresh + SVG icons: DONE

Deepened `--red`/`--blue` tokens, warmed `--bg`/`--surface2`, layered `--shadow-card` across all card components, dual-glow dark hero, and emoji category/status icons replaced with hand-drawn SVGs (`CAT_ICON_PATHS`/`CAT_ICON`/`catIcon()` in `lib/app-core.js`).

## Phase 1: real Supabase PIN auth — code DONE, seeding pending

Uses a **dedicated Supabase project for mku-sales-app-v2** (`hwgrswtahduyqxfokbwj`), not shared with any other app. An earlier draft of this reused Randy's PawonLoka POS project on the theory it was "the same business domain later anyway" — turned out that project's anon key already grants write access to PawonLoka's own cash/stock/asset tables (several have `anon`-scoped RLS policies), which would have exposed unrelated business data the moment this public repo got pushed. Caught before pushing; switched to this project instead. Lesson: don't assume project reuse is safe without checking what RLS policies already grant the anon key.

What exists as of this session:
- `supabase/migrations/0001_create_reps.sql` — `reps` table + RLS (authenticated-read-only; writes are seed-script-only via service_role).
- `lib/rep-alias.js` — shared `deriveLoginAlias()`, used by both the browser and the seed script so alias derivation can't drift.
- `lib/supabase-client.js` — Supabase client via the `esm.sh` CDN build (no bundler).
- `lib/auth.js` — `login`/`logout`/`restoreSession`, exposed as `window.AppAuth` for the classic-script `app-core.js` to call.
- Login UI: picking a name now opens a 6-digit PIN pad (`lib/app-core.js`'s `showPinPad`/`onPinDigit`/`submitPin` etc.) instead of the old "Continue" button. PIN length is 6, not the originally-planned 4, because Supabase enforces a 6-character minimum password length with no dashboard override — rather than padding a 4-digit PIN under the hood, went with a real 6-digit PIN (simpler, no derivation trick, and more brute-force-resistant). A valid Supabase session restores silently on reload (same "land straight on Target" UX as the old fake login); otherwise the PIN pad is required. `selectRep(idx, authInfo)` takes an additive second argument (`repId`/`authUserId`/`isManager`) but is still the single post-login entry point.
- `scripts/seed-reps.mjs` + `scripts/seed-reps.local.mjs.example` — one-time seed script (run locally, service_role key never committed) that creates all 14 reps' Supabase Auth users + `reps` rows. **Not yet run** — before running, Randy needs to: (1) apply `supabase/migrations/0001_create_reps.sql` in the new project's SQL editor, (2) copy the `.example` PIN file to `scripts/seed-reps.local.mjs` (gitignored) with real 6-digit PINs, (3) run the script with `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` env vars (no Auth dashboard setting change needed — 6 is already Supabase's default minimum).
- `is_manager` has no data source yet — the seed script defaults every rep to `false`; flip specific rows in Supabase Studio after seeding.

## Next steps
1. Run the seed script (see above) and verify login end-to-end for a real rep + a wrong-PIN case.
2. First real feature: competitor price log (Phase 2 in the plan) — simplest net-new write path, proves out RLS before anything else depends on it.

## Rules carried over from v1 (still apply)
- Overall % excludes Naughty Nuris (NN) from the denominator — NN shown as a separate mini metric only.
- Pace color thresholds are time-factor-based (`% of month elapsed`), not fixed cutoffs.
- Toolkit content is bilingual `{en, id}` objects — always access via `T()`/`TArr()`, never `.en`/`.id` directly.
- `STOCK_MAP`'s `saldo`/`st`/`buf` fields are stale-by-design — only `code` is load-bearing (bridges product ID → warehouse code). This changes once Feature 7 (auto-regen) lands, but the "only code matters, everything else is a snapshot" contract stays.
- Never touch `/Users/randy/mku-sales-app` or the `MKU-MKS-Area-Dashboard` pipeline repo from this project.
