-- Widen the Bisdev role to a third category: "Bisdev Bakery", a dedicated
-- login that sees a company-wide sales dashboard for Bakery only, exactly
-- like the existing Bisdev Food/Beverage roles (0010_bisdev_reps.sql).
-- Bakery became its own peer target category in the underlying data feed
-- (bakery_target/bakery_ach per area, alongside food_target/bev_target) and
-- the app's renderBisdevTarget() already supports category === 'bakery' —
-- this migration just lets a rep row actually be tagged that way.

alter table reps drop constraint reps_bisdev_category_check;
alter table reps add constraint reps_bisdev_category_check
  check (bisdev_category in ('food', 'beverage', 'bakery'));

comment on column reps.bisdev_category is
  'Bisdev role variant: company-wide Food, Beverage, or Bakery sales view. Null = not a Bisdev rep.';
