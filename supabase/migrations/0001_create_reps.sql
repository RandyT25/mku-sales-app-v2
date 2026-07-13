create table reps (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  login_alias   text unique not null,
  auth_user_id  uuid unique references auth.users(id),
  phone         text,
  is_nestle     boolean default false,
  is_manager    boolean default false,
  active        boolean default true,
  created_at    timestamptz default now()
);

alter table reps enable row level security;

-- Team-wide read visibility: any authenticated rep can see every rep's row.
-- No anon policy — login_alias is computed client-side from the rep's name
-- (lib/rep-alias.js), so this table is never read before authentication.
create policy "authenticated can read reps"
  on reps for select
  to authenticated
  using (true);

-- No insert/update/delete policy: rows are written only by the one-time
-- seed script (scripts/seed-reps.mjs) running with the service_role key,
-- which bypasses RLS entirely.
