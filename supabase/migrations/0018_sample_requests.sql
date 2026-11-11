-- Sample requests: a rep logs a sample (customer asked, or rep-initiated, or
-- imported from a Slow-Moving "Needs sample" answer) and follows it through
-- requested -> sent -> feedback -> done. Visibility/permissions mirror deals (0015):
-- team-wide read, owner edits own, Manager/Super Admin edit all.
create table sample_requests (
  id              uuid primary key default gen_random_uuid(),
  rep_id          uuid not null references reps(id),
  customer_name   text not null,
  customer_area   text,
  product_name    text not null,
  qty             text,
  source          text not null default 'customer_request' check (source in ('customer_request','rep_initiated','slow_moving')),
  source_item_id  uuid unique references product_assessment_items(id) on delete set null,
  status          text not null default 'requested' check (status in ('requested','sent','feedback','done','cancelled')),
  followup_due    date,
  sent_at         timestamptz,
  feedback_result text check (feedback_result in ('positive','negative','order_placed')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index sample_requests_status_due on sample_requests (status, followup_due);

alter table sample_requests enable row level security;

create policy "authenticated can read all sample requests"
  on sample_requests for select to authenticated using (true);

create policy "reps can insert their own sample requests"
  on sample_requests for insert to authenticated
  with check (rep_id = (select id from reps where auth_user_id = auth.uid()));

create policy "owner or admin can update sample requests"
  on sample_requests for update to authenticated
  using (rep_id = (select id from reps where auth_user_id = auth.uid())
         or exists (select 1 from reps where auth_user_id = auth.uid() and (is_manager or is_super_admin)))
  with check (rep_id = (select id from reps where auth_user_id = auth.uid())
         or exists (select 1 from reps where auth_user_id = auth.uid() and (is_manager or is_super_admin)));

create policy "owner or admin can delete sample requests"
  on sample_requests for delete to authenticated
  using (rep_id = (select id from reps where auth_user_id = auth.uid())
         or exists (select 1 from reps where auth_user_id = auth.uid() and (is_manager or is_super_admin)));
