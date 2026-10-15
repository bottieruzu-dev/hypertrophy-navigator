-- Apply before enabling Supabase OAuth Server on the shared project.
-- Adds restrictive guards to the 17 known kakeibo tables only.
-- No records are read/deleted; no grants or existing owner policies are changed.
-- Direct password sessions (no client_id) pass this additional condition.
-- ALL OAuth clients (nonempty client_id) are denied by this additional condition.
-- SQL Editor execution and actual browser login still need user verification.
begin;
do $preflight$
declare t text; table_oid oid; rls boolean;
begin
  foreach t in array array['wallets','account_titles','point_accounts','categories','recurring_items',
    'delivery_daily_logs','delivery_earnings','transactions','transaction_items','merchant_rules',
    'budgets','calendar_events','wallet_snapshots','point_lots','point_transactions','monthly_bills','shopping_items'] loop
    select c.oid,c.relrowsecurity into table_oid,rls
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relkind in ('r','p');
    if table_oid is null or not rls then raise exception 'Required RLS table missing or RLS disabled: %',t; end if;
  end loop;
  -- The inspected kakeibo RPCs are SECURITY INVOKER: table RLS applies to them.
  -- Stop if a definer RPC appears, since it may bypass these table guards.
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'kakeibo\_%' escape '\'
      and p.prosecdef and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')) then
    raise exception 'Review kakeibo SECURITY DEFINER RPCs before enabling OAuth';
  end if;
end $preflight$;
do $guards$
declare t text;
begin
  foreach t in array array['wallets','account_titles','point_accounts','categories','recurring_items',
    'delivery_daily_logs','delivery_earnings','transactions','transaction_items','merchant_rules',
    'budgets','calendar_events','wallet_snapshots','point_lots','point_transactions','monthly_bills','shopping_items'] loop
    execute format('drop policy if exists kakeibo_browser_only_nutrition_oauth on public.%I',t);
    execute format('create policy kakeibo_browser_only_nutrition_oauth on public.%I as restrictive for all to public
      using (coalesce((select auth.jwt())->>''client_id'','''')='''')
      with check (coalesce((select auth.jwt())->>''client_id'','''')='''')',t);
  end loop;
end $guards$;
-- Check the stored policy expressions against dummy claims, without querying rows.
-- This verifies the additional condition, not full end-to-end table access.
do $check$
declare guard record; expression text; passed boolean; n integer:=0;
  previous_claims text:=current_setting('request.jwt.claims',true);
begin
  for guard in select c.relname,p.polpermissive,p.polcmd,p.polroles,
      pg_catalog.pg_get_expr(p.polqual,p.polrelid) as read_expression,
      pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) as write_expression
    from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid
    join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
    where ns.nspname='public' and p.polname='kakeibo_browser_only_nutrition_oauth' loop
    n:=n+1;
    if guard.polpermissive or guard.polcmd<>'*' or not (0=any(guard.polroles))
      or guard.read_expression is null or guard.write_expression is null then
      raise exception 'Unexpected guard metadata: %',guard.relname;
    end if;
    foreach expression in array array[guard.read_expression,guard.write_expression] loop
      perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
      execute 'select ('||expression||')' into passed;
      if passed is distinct from true then raise exception 'Direct session condition failed: %',guard.relname; end if;
      perform set_config('request.jwt.claims','{"role":"authenticated","client_id":"nutrition-isolation-dummy-client"}',true);
      execute 'select ('||expression||')' into passed;
      if passed is distinct from false then raise exception 'OAuth condition failed: %',guard.relname; end if;
    end loop;
  end loop;
  if n<>17 then raise exception 'Expected 17 guards, found %',n; end if;
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
end $check$;
notify pgrst,'reload schema';
select true as kakeibo_oauth_guards_installed,17 as guarded_tables,
  true as dummy_policy_expression_checks_passed;
commit;
