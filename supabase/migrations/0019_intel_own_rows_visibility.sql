-- Intel visibility: a rep reads only their own competitor logs, deals and
-- sample requests; Bisdev (bisdev_category set), Manager and Super Admin read
-- every rep's. Replaces the team-wide SELECT policies from 0003 / 0015 / 0018.
-- Write policies are unchanged.
do $$
declare t text; pol text;
begin
  for t, pol in values
    ('competitor_logs', 'authenticated can read all competitor logs'),
    ('deals',           'authenticated can read all deals'),
    ('sample_requests', 'authenticated can read all sample requests')
  loop
    execute format('drop policy if exists %I on %I', pol, t);
    execute format($f$create policy %I on %I for select to authenticated using (
      rep_id = (select id from reps where auth_user_id = auth.uid())
      or exists (select 1 from reps where auth_user_id = auth.uid()
                 and (is_manager or is_super_admin or bisdev_category is not null))
    )$f$, t || ' own rows or privileged', t);
  end loop;
end $$;
