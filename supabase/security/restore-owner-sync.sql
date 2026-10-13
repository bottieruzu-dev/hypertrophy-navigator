-- Run manually in Supabase SQL Editor. This is a SINGLE-OWNER app migration.
-- First create your own Auth user in Authentication > Users.
-- Edit ONLY owner_id and legacy_rows_are_mine below, in your SQL Editor.
-- Never commit the real UUID or share passwords/keys.
-- All existing rows in the five personal tables must belong to that owner.
-- If these tables contain another person's data, DO NOT run this migration.
-- No records are deleted; existing primary keys remain unchanged.
begin;

create schema if not exists hypertrophy_private;
revoke all on schema hypertrophy_private from public, anon, authenticated;
create table if not exists hypertrophy_private.owner_registry (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id)
);
revoke all on hypertrophy_private.owner_registry from public, anon, authenticated;
alter table hypertrophy_private.owner_registry enable row level security;

do $migration$
declare
  owner_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace in SQL Editor
  legacy_rows_are_mine boolean := false; -- set true ONLY after confirming ownership
  table_name text;
  existing_owner uuid;
  other_owner boolean;
begin
  if not legacy_rows_are_mine or owner_id = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Set your Auth user UUID and confirm legacy ownership before running.';
  end if;
  if not exists (select 1 from auth.users where id = owner_id) then
    raise exception 'The chosen Auth user does not exist.';
  end if;
  select user_id into existing_owner from hypertrophy_private.owner_registry where singleton;
  if existing_owner is not null and existing_owner <> owner_id then
    raise exception 'Another owner is already registered. No ownership transfer performed.';
  end if;
  insert into hypertrophy_private.owner_registry(singleton, user_id)
    values (true, owner_id) on conflict (singleton) do nothing;

  foreach table_name in array array['baselines','sessions','sets','body_metrics','nutrition_logs'] loop
    if not exists (select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relkind = 'r') then
      raise exception 'Required ordinary table is missing: %', table_name;
    end if;
    execute format('lock table public.%I in access exclusive mode', table_name);
    execute format('alter table public.%I add column if not exists user_id uuid', table_name);
    execute format('select exists (select 1 from public.%I where user_id is not null and user_id <> $1)', table_name)
      into other_owner using owner_id;
    if other_owner then raise exception 'Another owner exists in %. Migration stopped.', table_name; end if;
    execute format('update public.%I set user_id = $1 where user_id is null', table_name) using owner_id;
    execute format('alter table public.%I alter column user_id set default auth.uid(), alter column user_id set not null', table_name);
    if not exists (select 1 from pg_catalog.pg_constraint
      where conrelid = format('public.%I', table_name)::regclass and conname = 'hypertrophy_owner_user_fk') then
      execute format('alter table public.%I add constraint hypertrophy_owner_user_fk foreign key (user_id) references auth.users(id)', table_name);
    end if;
  end loop;
end;
$migration$;

create unique index if not exists hypertrophy_sessions_owner_id on public.sessions(user_id, id);
do $relationship$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.sets'::regclass and conname = 'hypertrophy_sets_owner_session_fk') then
    -- NOT VALID preserves any old orphan sets. NEW writes must have an owned session.
    alter table public.sets add constraint hypertrophy_sets_owner_session_fk
      foreign key (user_id, session_id) references public.sessions(user_id, id) not valid;
  end if;
end;
$relationship$;

create or replace function public.hypertrophy_cloud_access()
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (select 1 from hypertrophy_private.owner_registry
    where singleton and user_id = (select auth.uid()));
$function$;
revoke all on function public.hypertrophy_cloud_access() from public, anon, authenticated;
grant execute on function public.hypertrophy_cloud_access() to authenticated;

do $policies$
declare table_name text; column_name text;
begin
  foreach table_name in array array['baselines','sessions','sets','body_metrics','nutrition_logs','exercises','muscle_credits'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    -- Table revocations alone do not revoke separately granted column privileges.
    for column_name in select a.attname from pg_catalog.pg_attribute a
      where a.attrelid = format('public.%I', table_name)::regclass and a.attnum > 0 and not a.attisdropped loop
      execute format('revoke select (%I), insert (%I), update (%I), references (%I) on public.%I from public, anon, authenticated',
        column_name, column_name, column_name, column_name, table_name);
    end loop;
    execute format('drop policy if exists hypertrophy_owner_guard on public.%I', table_name);
    execute format('drop policy if exists hypertrophy_owner_access on public.%I', table_name);
    if table_name in ('exercises','muscle_credits') then
      execute format('create policy hypertrophy_owner_guard on public.%I as restrictive for all to public using ((select public.hypertrophy_cloud_access())) with check (false)', table_name);
      execute format('create policy hypertrophy_owner_access on public.%I for select to authenticated using ((select public.hypertrophy_cloud_access()))', table_name);
      execute format('drop policy if exists hypertrophy_catalog_no_update on public.%I', table_name);
      execute format('drop policy if exists hypertrophy_catalog_no_delete on public.%I', table_name);
      execute format('create policy hypertrophy_catalog_no_update on public.%I as restrictive for update to public using (false) with check (false)', table_name);
      execute format('create policy hypertrophy_catalog_no_delete on public.%I as restrictive for delete to public using (false)', table_name);
      execute format('grant select on table public.%I to authenticated', table_name);
    else
      execute format('create policy hypertrophy_owner_guard on public.%I as restrictive for all to public using ((select public.hypertrophy_cloud_access()) and user_id = (select auth.uid())) with check ((select public.hypertrophy_cloud_access()) and user_id = (select auth.uid()))', table_name);
      execute format('create policy hypertrophy_owner_access on public.%I for all to authenticated using ((select public.hypertrophy_cloud_access()) and user_id = (select auth.uid())) with check ((select public.hypertrophy_cloud_access()) and user_id = (select auth.uid()))', table_name);
      execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    end if;
    -- Remove the emergency denial ONLY after the replacement guards exist.
    execute format('drop policy if exists hypertrophy_emergency_lockdown_20261014 on public.%I', table_name);
  end loop;
end;
$policies$;
notify pgrst, 'reload schema';
commit;
