-- Deals / keep-stock requests. A rep logs a special deal negotiated with a
-- customer and can ask for stock to be held for it; Manager/Super Admin
-- review requests and move them through pending → held → fulfilled/declined.
-- Mirrors competitor_logs' shape (0003) and team-wide visibility, but unlike
-- competitor_logs' owner-only edit policy (0006), status changes here also
-- need a Manager/Super Admin override so they can actually action a request.

create table deals (
  id             uuid primary key default gen_random_uuid(),
  rep_id         uuid not null references reps(id),
  product_id     text not null,
  product_name   text not null,
  customer_name  text not null,
  quantity       numeric not null,
  agreed_price   numeric,
  discount_note  text,
  reason         text,
  status         text not null default 'pending' check (status in ('pending','held','fulfilled','declined')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table deals enable row level security;

-- Team-wide read visibility, matching competitor_logs' (0003) confirmed
-- data-visibility decision: any rep can see any other rep's deal requests.
create policy "authenticated can read all deals"
  on deals for select
  to authenticated
  using (true);

-- A rep can only log a deal attributed to their own reps.id.
create policy "reps can insert their own deals"
  on deals for insert
  to authenticated
  with check (rep_id = (select id from reps where auth_user_id = auth.uid()));

-- Status changes: the owning rep, or a Manager/Super Admin acting on the
-- request (marking it held/fulfilled/declined).
create policy "owner or admin can update deals"
  on deals for update
  to authenticated
  using (
    rep_id = (select id from reps where auth_user_id = auth.uid())
    or exists (select 1 from reps where auth_user_id = auth.uid() and (is_manager or is_super_admin))
  )
  with check (
    rep_id = (select id from reps where auth_user_id = auth.uid())
    or exists (select 1 from reps where auth_user_id = auth.uid() and (is_manager or is_super_admin))
  );
