-- Metadata only. No food, body records, IDs or credentials are returned.
select c.relname as table_name,c.relrowsecurity as rls_enabled,
  has_table_privilege('anon',c.oid,'SELECT') as anon_select,
  has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_direct_select,
  has_table_privilege('authenticated',c.oid,'INSERT') as authenticated_direct_insert
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='hypertrophy_private' and c.relname in ('nutrition_jobs','nutrition_clients') order by c.relname;
select p.proname,p.prosecdef as security_definer,p.proconfig as function_settings,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('supabase_auth_admin',p.oid,'EXECUTE') as auth_admin_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'hypertrophy_nutrition_%' order by p.proname;
select c.relname as table_name,p.polpermissive=false as restrictive_browser_only
from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and p.polname='hypertrophy_browser_only' order by c.relname;
