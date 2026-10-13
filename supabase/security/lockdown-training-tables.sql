-- Emergency containment for ONLY the seven training tables in Security Advisor.
-- Run as the project owner in Supabase SQL Editor. Existing rows are not read or deleted.
-- API clients (including this app) lose access. Backend service_role bypasses RLS.
-- This is NOT the final authenticated synchronization migration.
begin;

do $lockdown$
declare
  table_name text;
  kind "char";
begin
  foreach table_name in array array[
    'sets', 'body_metrics', 'exercises', 'muscle_credits',
    'baselines', 'sessions', 'nutrition_logs'
  ] loop
    select c.relkind into kind
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name;
    if kind is null or kind not in ('r', 'p') then
      raise exception 'Expected training table public.% is missing or not a table; changes rolled back', table_name;
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    -- A restrictive policy also blocks existing broad permissive policies and column grants.
    -- Remove/recreate only our dedicated emergency policy so this script is repeatable.
    execute format('drop policy if exists hypertrophy_emergency_lockdown_20261014 on public.%I', table_name);
    execute format(
      'create policy hypertrophy_emergency_lockdown_20261014 on public.%I as restrictive for all to public using (false) with check (false)',
      table_name
    );
  end loop;
end;
$lockdown$;

commit;
