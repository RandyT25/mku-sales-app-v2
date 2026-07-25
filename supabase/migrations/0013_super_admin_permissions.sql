-- Extends a few previously Manager-only capabilities to Super Admin:
-- broadcasting announcements, moderating (edit/delete) any rep's
-- competitor intel entry, and editing any rep's profile fields
-- (phone/active/role). Additive policies only — existing Manager-scoped
-- and own-entry-scoped policies (0003, 0006, 0007) are untouched; Postgres
-- RLS ORs all matching policies together for a given operation.

create policy "super admins can create announcements"
  on announcements for insert
  to authenticated
  with check (
    author_rep_id = (select id from reps where auth_user_id = auth.uid())
    and (select is_super_admin from reps where auth_user_id = auth.uid()) = true
  );

create policy "super admins can update any competitor log"
  on competitor_logs for update
  to authenticated
  using ((select is_super_admin from reps where auth_user_id = auth.uid()) = true)
  with check ((select is_super_admin from reps where auth_user_id = auth.uid()) = true);

create policy "super admins can delete any competitor log"
  on competitor_logs for delete
  to authenticated
  using ((select is_super_admin from reps where auth_user_id = auth.uid()) = true);

-- Full-row update, not column-restricted (Postgres RLS can't restrict by
-- column) — acceptable since this is a single trusted admin role; the app's
-- own edit-profile UI only ever exposes phone/active/role fields to keep
-- accidental misuse guarded even though the policy itself is broader.
create policy "super admins can update any rep profile"
  on reps for update
  to authenticated
  using ((select is_super_admin from reps where auth_user_id = auth.uid()) = true)
  with check ((select is_super_admin from reps where auth_user_id = auth.uid()) = true);
