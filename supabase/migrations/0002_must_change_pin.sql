alter table reps add column must_change_pin boolean not null default true;

-- Lets a signed-in rep clear their own flag without a broad UPDATE policy
-- on `reps` (which stays locked to service_role for everything else).
create or replace function mark_pin_changed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update reps set must_change_pin = false where auth_user_id = auth.uid();
end;
$$;

grant execute on function mark_pin_changed() to authenticated;
