-- Two things:
--
-- 1. Idempotent re-assertion of the Super Admin policies from 0013 (plus the
--    own-entry competitor_logs policies from 0006). `supabase migration list
--    --linked` shows every migration's `remote` field empty, meaning the
--    CLI's migration-history table was never populated for this project —
--    these were most likely applied by hand via the Studio SQL editor at
--    some point, so there's no reliable way to tell from history alone
--    whether 0013 actually made it onto the live database. Re-creating them
--    here (drop-if-exists + create) is safe whether or not they're already
--    live, and gets them onto the DB via a real `db push` this time.
--
-- 2. A genuinely new capability: reps can update their OWN phone/photo_url
--    (features/rep-profile.js already calls this; there was never a policy
--    letting it succeed). A plain "update your own row" policy would also
--    let a rep grant themselves is_super_admin/is_manager/etc, since RLS
--    can't restrict by column — so this is enforced by a BEFORE UPDATE
--    trigger instead, which rejects the update unless the acting rep is a
--    super admin or the only columns changing are phone/photo_url. The
--    trigger only engages when there's an authenticated JWT context
--    (auth.uid() is not null); service_role / direct Studio SQL edits
--    (the seed script, or hand-editing a rep's role) are untouched.

-- ── Re-assert: reps ──

drop policy if exists "super admins can update any rep profile" on reps;
create policy "super admins can update any rep profile"
  on reps for update
  to authenticated
  using ((select is_super_admin from reps where auth_user_id = auth.uid()) = true)
  with check ((select is_super_admin from reps where auth_user_id = auth.uid()) = true);

-- ── Re-assert: competitor_logs ──

drop policy if exists "reps can update their own competitor logs" on competitor_logs;
create policy "reps can update their own competitor logs"
  on competitor_logs for update
  to authenticated
  using (rep_id = (select id from reps where auth_user_id = auth.uid()))
  with check (rep_id = (select id from reps where auth_user_id = auth.uid()));

drop policy if exists "reps can delete their own competitor logs" on competitor_logs;
create policy "reps can delete their own competitor logs"
  on competitor_logs for delete
  to authenticated
  using (rep_id = (select id from reps where auth_user_id = auth.uid()));

drop policy if exists "super admins can update any competitor log" on competitor_logs;
create policy "super admins can update any competitor log"
  on competitor_logs for update
  to authenticated
  using ((select is_super_admin from reps where auth_user_id = auth.uid()) = true)
  with check ((select is_super_admin from reps where auth_user_id = auth.uid()) = true);

drop policy if exists "super admins can delete any competitor log" on competitor_logs;
create policy "super admins can delete any competitor log"
  on competitor_logs for delete
  to authenticated
  using ((select is_super_admin from reps where auth_user_id = auth.uid()) = true);

-- ── Re-assert: announcements ──

drop policy if exists "super admins can create announcements" on announcements;
create policy "super admins can create announcements"
  on announcements for insert
  to authenticated
  with check (
    author_rep_id = (select id from reps where auth_user_id = auth.uid())
    and (select is_super_admin from reps where auth_user_id = auth.uid()) = true
  );

-- ── New: reps can update their own phone/photo_url ──

drop policy if exists "reps can update their own contact info" on reps;
create policy "reps can update their own contact info"
  on reps for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create or replace function enforce_rep_self_update_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_is_super_admin boolean;
begin
  -- No JWT context (service_role key, or direct SQL in Studio) — these are
  -- already fully-trusted paths, so skip the column restriction entirely.
  if auth.uid() is null then
    return new;
  end if;

  select is_super_admin into acting_is_super_admin
  from reps where auth_user_id = auth.uid();

  if coalesce(acting_is_super_admin, false) then
    return new;
  end if;

  if new.name is distinct from old.name
     or new.login_alias is distinct from old.login_alias
     or new.is_manager is distinct from old.is_manager
     or new.is_nestle is distinct from old.is_nestle
     or new.active is distinct from old.active
     or new.bisdev_category is distinct from old.bisdev_category
     or new.is_nestle_coordinator is distinct from old.is_nestle_coordinator
     or new.is_super_admin is distinct from old.is_super_admin
     or new.auth_user_id is distinct from old.auth_user_id
  then
    raise exception 'Reps may only update their own phone and photo_url';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_rep_self_update_columns on reps;
create trigger trg_enforce_rep_self_update_columns
  before update on reps
  for each row
  execute function enforce_rep_self_update_columns();
