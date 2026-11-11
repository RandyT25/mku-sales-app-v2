-- Rollback for 0019: restore team-wide read. Run by hand in Studio.
do $$
declare t text; pol text;
begin
  for t, pol in values
    ('competitor_logs', 'authenticated can read all competitor logs'),
    ('deals',           'authenticated can read all deals'),
    ('sample_requests', 'authenticated can read all sample requests')
  loop
    execute format('drop policy if exists %I on %I', t || ' own rows or privileged', t);
    execute format('create policy %I on %I for select to authenticated using (true)', pol, t);
  end loop;
end $$;
