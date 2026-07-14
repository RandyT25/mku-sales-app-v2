-- Live, Manager-sendable announcements/memos — replaces the previous
-- hand-edited data/announcements.js static file as the data source (that
-- file's rendering UI stays, only where it reads from changes). Supports
-- both company-wide broadcasts and a private memo to one specific rep.

create table announcements (
  id            uuid primary key default gen_random_uuid(),
  author_rep_id uuid not null references reps(id),
  target_rep_id uuid references reps(id), -- null = company-wide
  title         text not null,
  message       text not null,
  category      text not null default 'General',
  created_at    timestamptz not null default now()
);

alter table announcements enable row level security;

-- Read: company-wide rows visible to everyone; a targeted row is visible
-- only to its target rep and to the manager who authored it.
create policy "authenticated can read relevant announcements"
  on announcements for select
  to authenticated
  using (
    target_rep_id is null
    or target_rep_id = (select id from reps where auth_user_id = auth.uid())
    or author_rep_id = (select id from reps where auth_user_id = auth.uid())
  );

-- Insert: managers only, and only attributed to themselves.
create policy "managers can create announcements"
  on announcements for insert
  to authenticated
  with check (
    author_rep_id = (select id from reps where auth_user_id = auth.uid())
    and (select is_manager from reps where auth_user_id = auth.uid()) = true
  );
