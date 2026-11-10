-- Rollback for 0017_slow_moving_products.sql. Lives outside migrations/ so the
-- Supabase CLI never runs it as a forward migration. Run by hand in Studio.
-- WARNING: permanently deletes all slow-moving assessment data. The
-- customer_visits rows these RPCs created are left in place (they are normal
-- visit notes); delete them by hand if you also want them gone.
drop view if exists slow_moving_item_facts;
drop function if exists complete_product_assessment(uuid);
drop function if exists start_product_assessment(uuid);
drop table if exists product_assessment_items;
drop table if exists product_assessment_sessions;
drop table if exists slow_moving_products;
drop function if exists sm_guard_item_update();
drop function if exists sm_touch_updated_at();
drop function if exists sm_is_super_admin();
drop function if exists sm_current_rep_id();
