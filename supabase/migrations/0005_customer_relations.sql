create table customer_contacts (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id),
  rep_id       uuid not null references reps(id),
  name         text not null,
  role         text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table customer_contacts enable row level security;

create policy "authenticated can read customer contacts"
  on customer_contacts for select to authenticated using (true);
create policy "authenticated can insert customer contacts"
  on customer_contacts for insert to authenticated
  with check (rep_id = (select id from reps where auth_user_id = auth.uid()));
-- Any rep can fix/remove any contact — contacts are team-shared reference
-- data (a phone number goes stale, someone leaves), unlike the append-only
-- competitor_logs pattern. Restricting edits to "only whoever added it"
-- would block the actual use case: a different rep visits and learns the
-- previously-logged number is wrong.
create policy "authenticated can update customer contacts"
  on customer_contacts for update to authenticated using (true) with check (true);
create policy "authenticated can delete customer contacts"
  on customer_contacts for delete to authenticated using (true);

create table customer_visits (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id),
  rep_id       uuid not null references reps(id),
  note         text not null,
  created_at   timestamptz not null default now()
);
alter table customer_visits enable row level security;

create policy "authenticated can read customer visits"
  on customer_visits for select to authenticated using (true);
create policy "authenticated can insert their own visit notes"
  on customer_visits for insert to authenticated
  with check (rep_id = (select id from reps where auth_user_id = auth.uid()));
-- No update/delete policy — append-only, same as competitor_logs (Phase 2):
-- a visit note is a historical record, not something another rep should
-- rewrite after the fact.
