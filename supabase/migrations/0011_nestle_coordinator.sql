-- Nestle Coordinator: a single dedicated login that sees the whole Nestlé
-- team's combined sales (all of d.nestle_areas), same idea as Bisdev but for
-- a single fixed team rather than a Food/Beverage choice — a plain boolean
-- is enough, no category column needed.

alter table reps add column is_nestle_coordinator boolean default false;
