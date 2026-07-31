// Lets a Manager or Super Admin reset a locked-out rep's PIN from their
// phone. The standard email-reset flow doesn't work here — reps log in via
// a synthetic `<alias>@mkuv2.internal` address with no real inbox behind it
// (see lib/rep-alias.js) — so this has always meant Randy manually resetting
// a password in Supabase Studio. Same structure/conventions as
// supabase/functions/dashboard-proxy: own auth check first, then a
// privileged action using a server-side key the browser never sees.
// Deploy with --no-verify-jwt for the same reason as dashboard-proxy (this
// function does its own, stronger auth check; the platform's default
// gateway JWT check would otherwise reject the CORS preflight OPTIONS
// request, which carries no auth header).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_ORIGINS = ['https://randyt25.github.io'];

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function genTempPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const fail = (status: number, msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  try {
    // 1. Authenticate the caller with their own session, then check they're
    // a Manager or Super Admin ourselves — no RLS policy grants a plain
    // Manager any write to reps today, so this app-level check is the only
    // gate (mirrors dashboard-proxy's own-check pattern).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return fail(401, 'missing authorization header');

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return fail(401, 'invalid or expired session');

    const { data: callerRep, error: callerErr } = await callerClient
      .from('reps')
      .select('id, active, is_manager, is_super_admin')
      .eq('auth_user_id', user.id)
      .single();
    if (callerErr || !callerRep || !callerRep.active) return fail(403, 'not an active rep');
    if (!callerRep.is_manager && !callerRep.is_super_admin) return fail(403, 'not authorized to reset PINs');

    // 2. Resolve the target rep.
    const body = await req.json().catch(() => ({}));
    const targetRepId = body?.targetRepId;
    if (!targetRepId || typeof targetRepId !== 'string') return fail(400, 'missing targetRepId');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: targetRep, error: targetErr } = await admin
      .from('reps')
      .select('id, auth_user_id, active')
      .eq('id', targetRepId)
      .single();
    if (targetErr || !targetRep) return fail(404, 'rep not found');

    // 3. Set a temporary password via the Admin API (only server-side code
    // with the service-role key can force-set another user's password) and
    // flip must_change_pin so the existing forced-first-login PIN-pad flow
    // (lib/app-core.js submitPin()/_pinMode) makes them choose a real one
    // on their very next login — no client-side changes needed for that.
    const tempPin = genTempPin();
    const { error: pwErr } = await admin.auth.admin.updateUserById(targetRep.auth_user_id, {
      password: tempPin,
    });
    if (pwErr) return fail(500, 'could not set temporary PIN: ' + pwErr.message);

    const { error: flagErr } = await admin
      .from('reps')
      .update({ must_change_pin: true })
      .eq('id', targetRepId);
    if (flagErr) return fail(500, 'PIN was reset but could not force a change: ' + flagErr.message);

    return new Response(JSON.stringify({ tempPin }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('reset-rep-pin error', e);
    return fail(500, 'server error');
  }
});
