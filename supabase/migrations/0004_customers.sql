create table customers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  normalized_key text not null unique,
  area           text,
  created_at     timestamptz not null default now()
);

alter table customers enable row level security;

create policy "authenticated can read customers"
  on customers for select
  to authenticated
  using (true);

-- Race-safe get-or-create: any rep can resolve/create a canonical customer
-- row via this function, without needing a broad insert policy on the table
-- itself (security definer + unique constraint on normalized_key does the work).
create or replace function get_or_create_customer(p_name text, p_area text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := upper(trim(p_name)) || '|' || upper(trim(coalesce(p_area, '')));
  v_id uuid;
begin
  insert into customers (name, normalized_key, area)
  values (p_name, v_key, p_area)
  on conflict (normalized_key) do nothing;

  select id into v_id from customers where normalized_key = v_key;
  return v_id;
end;
$$;

grant execute on function get_or_create_customer(text, text) to authenticated;
