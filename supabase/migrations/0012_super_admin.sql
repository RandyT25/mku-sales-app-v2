-- Super Admin: a dedicated login (separate from Manager) that can "view as"
-- any other rep to check/test what they see, without needing that rep's PIN.
-- Reads the target rep's real row (reps table already has team-wide
-- authenticated read, 0001_create_reps.sql) and re-renders the app under
-- that identity client-side — the Supabase Auth session underneath stays
-- Super Admin's own the whole time, so writes still attribute to them, not
-- the viewed rep. No password sharing, no server-side function needed.

alter table reps add column is_super_admin boolean default false;
