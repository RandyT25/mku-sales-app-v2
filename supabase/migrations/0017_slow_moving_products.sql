-- Intel → Slow-Moving Products.
-- Structured customer feedback on a centrally-managed set of slow-moving
-- products, collected per customer visit. Additive only: touches no existing
-- table except one INSERT/UPDATE of a customer_visits row made by the RPCs
-- below (reusing the existing visit table instead of inventing a second one).
-- Rollback: supabase/migrations_rollback/0017_down.sql
--
-- Business rules enforced here (not trusted to the client):
--   * One assessment session per visit (unique visit_id).
--   * One open (draft) session per rep+customer — resumable, never duplicated.
--   * Items are created when the session starts, one per ACTIVE product, so the
--     product set is frozen for that session; completion needs every item to
--     have a status (Not applicable counts) — checked atomically in the RPC.
--   * rep_id always comes from auth.uid(), never from the client.
--   * Completed sessions are immutable for reps; Super Admin may amend.
--   * Products are deactivated, never deleted — history stays intact.

-- ── helpers ──────────────────────────────────────────────────────────────
create or replace function sm_current_rep_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from reps where auth_user_id = auth.uid() and active
$$;

create or replace function sm_is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from reps where auth_user_id = auth.uid()), false)
$$;

create or replace function sm_touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

-- ── 1. product master ────────────────────────────────────────────────────
create table slow_moving_products (
  id            uuid primary key default gen_random_uuid(),
  product_name  text not null,
  packaging     text not null,
  active        boolean not null default true,
  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (product_name, packaging)
);
create trigger slow_moving_products_touch before update on slow_moving_products
  for each row execute function sm_touch_updated_at();

insert into slow_moving_products (product_name, packaging, display_order) values
  ('Komi Shoyu Sauce',                    '5L',     1),
  ('Komi Sushi Vinegar',                  '5L',     2),
  ('Komi Sweet Cooking Seasoning',        '5L',     3),
  ('Komi Teriyaki Sauce',                 '1.9L',   4),
  ('Komi Unagi Sauce',                    '1.9L',   5),
  ('Wasabi Paste',                        '43 Gr',  6),
  ('O Sole Don Pistacchio',               '560 Gr', 7),
  ('Bottegaio Umbro Olio EVO Cucina',     '5L',     8)
on conflict (product_name, packaging) do nothing;

alter table slow_moving_products enable row level security;
create policy "authenticated can read slow moving products"
  on slow_moving_products for select to authenticated using (true);
create policy "super admins can add slow moving products"
  on slow_moving_products for insert to authenticated with check (sm_is_super_admin());
create policy "super admins can edit slow moving products"
  on slow_moving_products for update to authenticated
  using (sm_is_super_admin()) with check (sm_is_super_admin());
-- no delete policy: deactivate instead.

-- ── 2. sessions ──────────────────────────────────────────────────────────
create table product_assessment_sessions (
  id                uuid primary key default gen_random_uuid(),
  visit_id          uuid not null unique references customer_visits(id),
  customer_id       uuid not null references customers(id),
  rep_id            uuid not null references reps(id),
  assessment_status text not null default 'draft' check (assessment_status in ('draft','completed')),
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((assessment_status = 'completed') = (completed_at is not null))
);
-- at most one open draft per rep+customer
create unique index product_assessment_one_open_draft
  on product_assessment_sessions (rep_id, customer_id) where assessment_status = 'draft';
create index product_assessment_sessions_customer on product_assessment_sessions (customer_id);
create trigger product_assessment_sessions_touch before update on product_assessment_sessions
  for each row execute function sm_touch_updated_at();

alter table product_assessment_sessions enable row level security;
-- Team-wide read, same as every other table in this app (v2-brain.md).
create policy "authenticated can read assessment sessions"
  on product_assessment_sessions for select to authenticated using (true);
-- No rep INSERT/UPDATE/DELETE policy: reps go through the RPCs below.
create policy "super admins can amend assessment sessions"
  on product_assessment_sessions for update to authenticated
  using (sm_is_super_admin()) with check (sm_is_super_admin());
create policy "super admins can delete assessment sessions"
  on product_assessment_sessions for delete to authenticated using (sm_is_super_admin());

-- ── 3. items ─────────────────────────────────────────────────────────────
create table product_assessment_items (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null references product_assessment_sessions(id) on delete cascade,
  product_id               uuid not null references slow_moving_products(id),
  feedback_status          text check (feedback_status in (
                             'interested','needs_sample','price_too_high','packaging_issue',
                             'uses_competitor','not_interested','not_applicable','not_familiar')),
  customer_comment         text,
  explanation              text,
  target_price             numeric check (target_price is null or target_price >= 0),
  requested_packaging      text,
  competitor_brand         text,
  estimated_monthly_volume numeric check (estimated_monthly_volume is null or estimated_monthly_volume >= 0),
  target_purchase_date     date,
  sample_requirements      text,
  followup_required        boolean not null default false,
  not_applicable_reason    text,
  rejection_reason         text,
  education_opportunity    boolean,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (session_id, product_id)
);
create index product_assessment_items_product on product_assessment_items (product_id);

-- Items are born with the session; reps may only edit the answer fields.
create or replace function sm_guard_item_update() returns trigger
language plpgsql as $$
begin
  if new.session_id <> old.session_id or new.product_id <> old.product_id then
    raise exception 'session_id/product_id cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger product_assessment_items_guard before update on product_assessment_items
  for each row execute function sm_guard_item_update();

alter table product_assessment_items enable row level security;
create policy "authenticated can read assessment items"
  on product_assessment_items for select to authenticated using (true);
-- A rep edits only items of their OWN session while it is still a draft.
create policy "reps can edit items of their own draft session"
  on product_assessment_items for update to authenticated
  using (exists (select 1 from product_assessment_sessions s
                 where s.id = session_id and s.assessment_status = 'draft'
                   and s.rep_id = sm_current_rep_id()))
  with check (exists (select 1 from product_assessment_sessions s
                 where s.id = session_id and s.assessment_status = 'draft'
                   and s.rep_id = sm_current_rep_id()));
create policy "super admins can amend assessment items"
  on product_assessment_items for update to authenticated
  using (sm_is_super_admin()) with check (sm_is_super_admin());

-- ── 4. RPCs ──────────────────────────────────────────────────────────────
-- Starts (or resumes) the caller's assessment for a customer.
create or replace function start_product_assessment(p_customer_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_rep   uuid := sm_current_rep_id();
  v_sess  uuid;
  v_visit uuid;
begin
  if v_rep is null then raise exception 'not an active rep'; end if;
  if not exists (select 1 from customers where id = p_customer_id) then
    raise exception 'unknown customer';
  end if;
  if not exists (select 1 from slow_moving_products where active) then
    raise exception 'no active slow-moving products configured';
  end if;

  select id into v_sess from product_assessment_sessions
   where rep_id = v_rep and customer_id = p_customer_id and assessment_status = 'draft';
  if v_sess is not null then return v_sess; end if;

  insert into customer_visits (customer_id, rep_id, note)
  values (p_customer_id, v_rep, 'Slow-moving product assessment (in progress)')
  returning id into v_visit;

  insert into product_assessment_sessions (visit_id, customer_id, rep_id)
  values (v_visit, p_customer_id, v_rep)
  returning id into v_sess;

  insert into product_assessment_items (session_id, product_id)
  select v_sess, id from slow_moving_products where active;

  return v_sess;
end;
$$;

-- Atomically completes a draft: every item must have a status.
create or replace function complete_product_assessment(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rep     uuid := sm_current_rep_id();
  s         product_assessment_sessions;
  v_missing int;
  v_total   int;
begin
  select * into s from product_assessment_sessions where id = p_session_id for update;
  if not found then raise exception 'unknown session'; end if;
  if s.rep_id is distinct from v_rep and not sm_is_super_admin() then
    raise exception 'not your assessment';
  end if;
  if s.assessment_status = 'completed' then return; end if; -- idempotent, no double submit

  select count(*) filter (where feedback_status is null), count(*)
    into v_missing, v_total
    from product_assessment_items where session_id = p_session_id;
  if v_total = 0 then raise exception 'assessment has no items'; end if;
  if v_missing > 0 then
    raise exception 'assessment incomplete: % of % products have no status', v_missing, v_total
      using errcode = 'check_violation';
  end if;

  update product_assessment_sessions
     set assessment_status = 'completed', completed_at = now()
   where id = p_session_id;
  update customer_visits
     set note = 'Slow-moving product assessment completed (' || v_total || '/' || v_total || ')'
   where id = s.visit_id;
end;
$$;

revoke all on function start_product_assessment(uuid)    from public, anon;
revoke all on function complete_product_assessment(uuid) from public, anon;
grant execute on function start_product_assessment(uuid)    to authenticated;
grant execute on function complete_product_assessment(uuid) to authenticated;

-- ── 5. dashboard facts (completed assessments only, RLS applies to caller) ──
create view slow_moving_item_facts with (security_invoker = true) as
select
  i.id as item_id, i.session_id, i.product_id,
  p.product_name, p.packaging, p.display_order,
  i.feedback_status, i.customer_comment, i.explanation, i.target_price,
  i.requested_packaging, i.competitor_brand, i.estimated_monthly_volume,
  i.target_purchase_date, i.sample_requirements, i.followup_required,
  i.not_applicable_reason, i.rejection_reason, i.education_opportunity,
  s.customer_id, c.name as customer_name, c.normalized_key as customer_key, c.area as customer_area,
  s.rep_id, r.name as rep_name, s.visit_id, s.completed_at
from product_assessment_items i
join product_assessment_sessions s on s.id = i.session_id and s.assessment_status = 'completed'
join slow_moving_products p on p.id = i.product_id
join customers c on c.id = s.customer_id
join reps r on r.id = s.rep_id;
grant select on slow_moving_item_facts to authenticated;
