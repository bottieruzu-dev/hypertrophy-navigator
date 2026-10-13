-- Read-only METADATA check, not a query of personal records.
with expected(table_name) as (
  values ('sets'), ('body_metrics'), ('exercises'), ('muscle_credits'),
         ('baselines'), ('sessions'), ('nutrition_logs')
)
select e.table_name,
       c.relrowsecurity as rls_enabled,
       p.polpermissive = false as restrictive_lockdown,
       pg_catalog.pg_get_expr(p.polqual, p.polrelid) as read_condition,
       pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as write_condition,
       0 = any(p.polroles) as applies_to_public,
       pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') as anon_table_select,
       pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_table_select
from expected e
left join pg_catalog.pg_namespace n on n.nspname = 'public'
left join pg_catalog.pg_class c on c.relnamespace = n.oid and c.relname = e.table_name
left join pg_catalog.pg_policy p on p.polrelid = c.oid
  and p.polname = 'hypertrophy_emergency_lockdown_20261014'
order by e.table_name;
