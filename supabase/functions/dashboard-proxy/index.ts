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
// Filenames are URL-encoded client-side (space -> %20), e.g. "MKU%2025.xlsx".
const FJ_FILE_RE = /^(MKU|MKS)%20\d{1,2}\.xlsx$/;

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
    let ghPath: string;
    let binary: boolean;

    if (type === 'jsfile' && JSFILE_ALLOWLIST.has(file)) {
      // These files are served from the repo's GitHub Pages source dir, not
      // repo root (confirmed via the Contents API: root has no .js files,
      // docs/ has data_sales.js, data.js, customers.js).
      ghPath = `docs/${file}`;
      binary = false;
    } else if (type === 'fj' && FJ_FILE_RE.test(file)) {
      ghPath = `uploads/${file}`;
      binary = true;
    } else {
      return fail(400, 'invalid type/file');
    }

    // 3. Fetch from GitHub using the server-side token — works identically
    // whether the repo is public or private, as long as the token has read
    // access to it.
    const ghResp = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${ghPath}`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.raw',
        },
        cache: 'no-store',
      }
    );
    if (!ghResp.ok) return fail(502, `upstream ${ghResp.status}`);

    if (binary) {
      const buf = await ghResp.arrayBuffer();
      return new Response(buf, {
        headers: { ...cors, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' },
      });
    }
    const text = await ghResp.text();
    return new Response(text, {
      headers: { ...cors, 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('dashboard-proxy error', e);
    return fail(500, 'server error');
  }
});
