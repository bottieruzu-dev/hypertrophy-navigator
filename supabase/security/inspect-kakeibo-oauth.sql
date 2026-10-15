-- Read-only metadata. Does not read financial records, credentials, Auth IDs,
-- policy expressions or function bodies. One result avoids hidden result tabs.
-- Detection of client_id text is NOT proof that a policy/function is secure.
with expected(table_name) as (
  values ('wallets'), ('account_titles'), ('point_accounts'), ('categories'),
    ('recurring_items'), ('delivery_daily_logs'), ('delivery_earnings'),
    ('transactions'), ('transaction_items'), ('merchant_rules'), ('budgets'),
    ('calendar_events'), ('wallet_snapshots'), ('point_lots'),
    ('point_transactions'), ('monthly_bills'), ('shopping_items')
), tables as (
  select e.table_name, c.oid is not null as table_exists,
    c.relrowsecurity as rls_enabled,
    has_table_privilege('anon',c.oid,'SELECT') as anon_select,
    has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
    (select count(*) from pg_catalog.pg_policy p where p.polrelid=c.oid) as policy_count,
    (select count(*) from pg_catalog.pg_policy p where p.polrelid=c.oid
      and not p.polpermissive and p.polcmd='*'
      and position('client_id' in coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),''))>0
      and position('client_id' in coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''))>0
    ) as restrictive_all_policies_mentioning_client_id
  from expected e
  left join pg_catalog.pg_namespace n on n.nspname='public'
  left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=e.table_name
    and c.relkind in ('r','p')
), functions as (
  select p.proname as function_name, p.prosecdef as security_definer,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
    position('client_id' in p.prosrc)>0 as body_mentions_client_id
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'kakeibo\_%' escape '\'
)
select
  (select jsonb_agg(to_jsonb(t) order by t.table_name) from tables t) as tables,
  (select coalesce(jsonb_agg(to_jsonb(f) order by f.function_name),'[]'::jsonb) from functions f) as functions;
