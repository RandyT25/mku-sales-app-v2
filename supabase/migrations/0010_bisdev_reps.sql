-- Bisdev role: two dedicated logins ("Bisdev Food", "Bisdev Beverage") that
-- see a company-wide sales dashboard for their category only, mirroring how
-- is_nestle/is_manager already gate role-specific dashboards. Single nullable
-- column rather than a boolean + separate category field, so there's no
-- invalid "is_bisdev but no category" state.

alter table reps add column bisdev_category text
  check (bisdev_category in ('food', 'beverage'));

comment on column reps.bisdev_category is
  'Bisdev role variant: company-wide Food or Beverage sales view. Null = not a Bisdev rep.';
