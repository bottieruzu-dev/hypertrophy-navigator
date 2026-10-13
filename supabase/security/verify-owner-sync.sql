-- Metadata only: no personal records, keys, Auth UUIDs or email addresses.
with expected(table_name) as (
  values ('baselines'), ('body_metrics'), ('exercises'), ('muscle_credits'),
         ('nutrition_logs'), ('sessions'), ('sets')
)
select e.table_name, c.relrowsecurity as rls_enabled,
  exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid
    and p.polname = 'hypertrophy_owner_guard' and not p.polpermissive) as restrictive_owner_guard,
  exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid
    and p.polname = 'hypertrophy_owner_access' and p.polpermissive) as owner_access_policy,
  exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid
    and a.attname = 'user_id' and a.attnotnull and a.atttypid = 'uuid'::regtype) as owner_column,
  exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid
    and p.polname = 'hypertrophy_emergency_lockdown_20261014') as emergency_lockdown_remaining,
  pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
  pg_catalog.has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
  pg_catalog.has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete
from expected e
left join pg_catalog.pg_namespace n on n.nspname = 'public'
left join pg_catalog.pg_class c on c.relnamespace = n.oid and c.relname = e.table_name
order by e.table_name;

select p.proname, p.prosecdef as security_definer, p.proconfig as function_settings,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'hypertrophy_cloud_access';

select count(*) = 1 as exactly_one_registered_owner from hypertrophy_private.owner_registry;
select conname, convalidated from pg_catalog.pg_constraint
where conrelid = 'public.sets'::regclass and conname = 'hypertrophy_sets_owner_session_fk';
