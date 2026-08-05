-- Rounds out Super Admin's moderation powers to match "can act on anything
-- team-wide," extending the pattern started in 0013 (competitor_logs,
-- reps, announcements-insert) to the remaining append-only/no-override
-- tables: announcements can now be deleted, visit notes can be edited or
-- deleted, and a customer's canonical name/area can be corrected. Additive
-- only — existing scoped policies from 0005/0007 untouched, RLS ORs them.

create policy "super admins can delete any announcement"
  on announcements for delete
  to authenticated
  using ((select is_super_admin from reps where auth_user_id = auth.uid()) = true);

create policy "super admins can update any visit note"
  on customer_visits for update
  to authenticated
  using ((select is_super_admin from reps where auth_user_id = auth.uid()) = true)
  with check ((select is_super_admin from reps where auth_user_id = auth.uid()) = true);

create policy "super admins can delete any visit note"
  on customer_visits for delete
  to authenticated
  using ((select is_super_admin from reps where auth_user_id = auth.uid()) = true);

-- Note: this is the thin Supabase `customers` row used only to anchor
-- customer_contacts/customer_visits (created via get_or_create_customer()) —
-- not the same "customer" shown in the Customers tab, which reads from the
-- separate static CUSTOMERS feed (customers.js). Fixing name/area here only
-- affects which customer_id future contacts/visits attach to.
create policy "super admins can update any customer"
  on customers for update
  to authenticated
  using ((select is_super_admin from reps where auth_user_id = auth.uid()) = true)
  with check ((select is_super_admin from reps where auth_user_id = auth.uid()) = true);
