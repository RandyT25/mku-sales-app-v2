create table competitor_logs (
  id             uuid primary key default gen_random_uuid(),
  rep_id         uuid not null references reps(id),
  competitor_name text not null,
  product        text not null,
  category       text,
  price          numeric not null,
  unit           text not null,
  customer_name  text,
  notes          text,
  created_at     timestamptz not null default now()
);

alter table competitor_logs enable row level security;

-- Team-wide read visibility, matching v2-brain.md's confirmed data-visibility
-- decision: any rep can see any other rep's competitor logs.
create policy "authenticated can read all competitor logs"
  on competitor_logs for select
  to authenticated
  using (true);

-- Append-only for v1 — no update/delete policy. A rep can only insert a row
-- attributed to their own reps.id (resolved from their own auth.uid()), so
-- nobody can log an entry under someone else's name.
create policy "reps can insert their own competitor logs"
  on competitor_logs for insert
  to authenticated
  with check (rep_id = (select id from reps where auth_user_id = auth.uid()));
