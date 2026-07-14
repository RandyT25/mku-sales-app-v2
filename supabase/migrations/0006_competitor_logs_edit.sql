-- Allows a rep to fix/remove their own competitor intel entries in-app
-- (previously append-only — mistakes had to be fixed directly in Studio).
-- Scoped to own entries only, same ownership-resolution expression already
-- used for insert — no moderation override for other reps' entries in v1.

create policy "reps can update their own competitor logs"
  on competitor_logs for update
  to authenticated
  using (rep_id = (select id from reps where auth_user_id = auth.uid()))
  with check (rep_id = (select id from reps where auth_user_id = auth.uid()));

create policy "reps can delete their own competitor logs"
  on competitor_logs for delete
  to authenticated
  using (rep_id = (select id from reps where auth_user_id = auth.uid()));
