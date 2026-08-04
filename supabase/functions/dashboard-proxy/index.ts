// Auth-gated proxy in front of the RandyT25/MKU-MKS-Area-Dashboard repo.
// That repo holds real sales/customer/delivery data and was previously
// fetched directly from the browser via plain public GitHub URLs — anyone
// with the URL could read it, completely bypassing the app's PIN login.
// This function requires a valid, active rep's Supabase session before
// fetching anything, using a server-side GitHub token the browser never
// sees. Deploy with --no-verify-jwt (this function does its own, stronger
// auth check; the platform's default gateway JWT check would otherwise
// reject the CORS preflight OPTIONS request, which carries no auth header).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GITHUB_OWNER = 'RandyT25';
const GITHUB_REPO = 'MKU-MKS-Area-Dashboard';
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Internal company tool, not a public API — lock CORS to the real app origin.
const ALLOWED_ORIGINS = ['https://randyt25.github.io'];

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
  };
}

const JSFILE_ALLOWLIST = new Set(['data_sales.js', 'data.js', 'customers.js']);
// Filenames are URL-encoded client-side via encodeURIComponent (real
// filenames contain a space, e.g. "MKU 25.xlsx" -> "MKU%2025.xlsx" on the
// wire); url.searchParams.get below already undoes that one layer of
// encoding, so `file` here holds a real space character, not "%20" text.
const FJ_FILE_RE = /^(MKU|MKS) \d{1,2}\.xlsx$/;

// jsfile responses (data_sales.js/data.js/customers.js) are the slow part
// of every login/refresh — each one is a real round trip to GitHub's API
// (not its CDN), measured at ~1-2.5s per file versus ~0.5s for the old
// direct-to-CDN fetch this proxy replaced. This data only actually changes
// when Randy re-uploads it (at most a few times a day), so a short-lived
// in-memory cache — kept in module scope, which Supabase Edge Functions
// persist across requests on the same warm instance — turns repeat
// requests within the window into near-instant responses without weakening
// the auth gate above (still required on every request, cache or not).
// Lost on a cold start; that's fine, it just refills on the next request.
const JSFILE_CACHE_TTL_MS = 60_000;
const jsfileCache = new Map<string, { text: string; expires: number }>();

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const fail = (status: number, msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  try {
    // 1. Authenticate the caller with their own session, same as the app's
    // own login/session-restore checks (lib/auth.js).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return fail(401, 'missing authorization header');

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return fail(401, 'invalid or expired session');

    const { data: repRow, error: repErr } = await supabase
      .from('reps')
      .select('id, active')
      .eq('auth_user_id', user.id)
      .single();
    if (repErr || !repRow || !repRow.active) return fail(403, 'not an active rep');

    // 2. Resolve which upstream file was requested — strict allowlist, never
    // pass the raw query param through to GitHub unchecked.
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const file = url.searchParams.get('file') || '';

    // Directory listing for uploads/ — lets the client check which FJ delivery
    // files actually exist before fetching, instead of guessing forward
    // through several dates and eating a failed request (logged loudly by the
    // browser regardless of app-level try/catch) for each date not yet
    // uploaded.
    if (type === 'list') {
      // The sibling pipeline archives MKU/MKS delivery files into
      // uploads/archive/ shortly after each upload (see the `fj` fetch
      // below) — merge both listings so the client's existence pre-check
      // still finds a file after it's been archived, instead of wrongly
      // concluding it was never uploaded. The archive listing is
      // best-effort: treat a missing/erroring uploads/archive (e.g. before
      // the first archive ever happens) as empty, not a hard failure.
      const fetchNames = async (path: string): Promise<string[] | null> => {
        const r = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
          {
            headers: {
              Authorization: `token ${GITHUB_TOKEN}`,
              Accept: 'application/vnd.github+json',
            },
            cache: 'no-store',
          }
        );
        if (!r.ok) return null;
        const entries = await r.json();
        return Array.isArray(entries) ? entries.map((e: { name: string }) => e.name) : [];
      };
      const [uploadNames, archiveNames] = await Promise.all([
        fetchNames('uploads'),
        fetchNames('uploads/archive'),
      ]);
      if (uploadNames === null) return fail(502, 'upstream error listing uploads');
      const names = [...new Set([...uploadNames, ...(archiveNames || [])])];
      return new Response(JSON.stringify(names), {
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    if (type === 'jsfile' && JSFILE_ALLOWLIST.has(file)) {
      const cached = jsfileCache.get(file);
      if (cached && cached.expires > Date.now()) {
        return new Response(cached.text, {
          headers: { ...cors, 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Cache': 'HIT' },
        });
      }
      // These files are served from the repo's GitHub Pages source dir, not
      // repo root (confirmed via the Contents API: root has no .js files,
      // docs/ has data_sales.js, data.js, customers.js).
      const ghResp = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/docs/${file}`,
        {
          headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.raw' },
          cache: 'no-store',
        }
      );
      if (!ghResp.ok) return fail(502, `upstream ${ghResp.status}`);
      const text = await ghResp.text();
      jsfileCache.set(file, { text, expires: Date.now() + JSFILE_CACHE_TTL_MS });
      return new Response(text, {
        headers: { ...cors, 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Cache': 'MISS' },
      });
    }

    if (type !== 'fj' || !FJ_FILE_RE.test(file)) return fail(400, 'invalid type/file');

    // 3. Fetch from GitHub using the server-side token — works identically
    // whether the repo is public or private, as long as the token has read
    // access to it. FJ Excel files change daily and are binary, so no
    // caching here (unlike jsfile above). `file` holds a real space (see
    // FJ_FILE_RE comment above) — re-encode it explicitly rather than
    // relying on the runtime to auto-encode a raw space inside a template
    // literal passed to fetch().
    const fetchFj = (path: string) =>
      fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}/${encodeURIComponent(file)}`,
        {
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.raw',
          },
          cache: 'no-store',
        }
      );

    // The sibling pipeline archives MKU/MKS delivery files into
    // uploads/archive/ shortly after each upload (so its own uploads/ glob
    // doesn't reprocess stale day-only filenames on a future run) — try the
    // live location first (freshest, covers the narrow pre-archive window),
    // then the archive, so the app keeps working across that transition
    // instead of the file going dark the moment it's processed.
    let ghResp = await fetchFj('uploads');
    if (ghResp.status === 404) ghResp = await fetchFj('uploads/archive');
    if (!ghResp.ok) return fail(502, `upstream ${ghResp.status}`);

    const buf = await ghResp.arrayBuffer();
    return new Response(buf, {
      headers: { ...cors, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('dashboard-proxy error', e);
    return fail(500, 'server error');
  }
});
