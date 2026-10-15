-- Dummy-only transaction. Run the entire file AFTER nutrition-work.sql; always ROLLBACK.
-- If any assertion fails, run ROLLBACK; before investigating. Do not weaken policies.
begin;
do $$ declare uid uuid; begin
  select user_id into strict uid from hypertrophy_private.owner_registry;
  if exists(select 1 from hypertrophy_private.nutrition_jobs where id like 'nutrition-isolation-dummy-%')
    or exists(select 1 from hypertrophy_private.nutrition_clients where client_id='nutrition-isolation-dummy-client')
    or exists(select 1 from public.baselines where exercise_id=2147483001) then raise exception 'Dummy collision'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare r jsonb; begin
  perform public.hypertrophy_nutrition_client('nutrition-isolation-dummy-client','https://dummy.supabase.co/functions/v1/nutrition-work-mcp',true);
  perform public.hypertrophy_nutrition_enqueue(
    '{"id":"nutrition-isolation-dummy-1","date":"2026-01-01","meal":"lunch","createdAt":1,"items":[{"id":"food","name":"Dummy","product":"","note":"","state":"raw","quantity":100,"unit":"g"}]}',
    '{"date":"2026-01-01","profile":{}}');
  -- Repeated upload is idempotent.
  perform public.hypertrophy_nutrition_enqueue(
    '{"id":"nutrition-isolation-dummy-1","date":"2026-01-01","meal":"lunch","createdAt":1,"items":[{"id":"food","name":"Dummy","product":"","note":"","state":"raw","quantity":100,"unit":"g"}]}',
    '{"date":"2026-01-01","profile":{}}');
  insert into public.baselines(exercise_id,weight_kg,reps,rir,est1rm,calibrated_at) values(2147483001,20,8,2,26,1);
  r:=jsonb_set(current_setting('request.jwt.claims')::jsonb,'{client_id}','"nutrition-isolation-dummy-client"');
  r:=r||'{"aud":"https://dummy.supabase.co/functions/v1/nutrition-work-mcp","scope":"openid"}';
  perform set_config('request.jwt.claims',r::text,true);
end $$;
do $$ declare denied boolean; n bigint; response jsonb :=
  '{"version":1,"requestId":"nutrition-isolation-dummy-1","date":"2026-01-01","meal":"lunch","basis":"consumed","items":[{"id":"food","quantity":100,"unit":"g","edibleGrams":100,"nutrients":{"protein_g":10},"source":"dummy test only","assumptions":"not a nutrition estimate"}]}';
begin
  perform public.hypertrophy_nutrition_get('nutrition-isolation-dummy-1');
  perform public.hypertrophy_nutrition_save_draft('nutrition-isolation-dummy-1',0,response);
  perform public.hypertrophy_nutrition_save_draft('nutrition-isolation-dummy-1',0,response);
  denied:=false;
  begin perform public.hypertrophy_nutrition_save_draft('nutrition-isolation-dummy-1',99,jsonb_set(response,'{items,0,nutrients,protein_g}','11'));
  exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Stale draft was accepted'; end if;
  denied:=false;
  begin perform public.hypertrophy_nutrition_save_draft('nutrition-isolation-dummy-1',1,jsonb_set(response,'{items,0,nutrients,protein_g}','-1'));
  exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Negative nutrient was accepted'; end if;
  denied:=false;
  begin perform public.hypertrophy_nutrition_confirm('nutrition-isolation-dummy-1',1);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Worker confirmed a meal'; end if;
  denied:=false;
  begin perform public.hypertrophy_nutrition_list('2026-01-01','2026-01-01');
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Worker read private targets'; end if;
  select count(*) into n from public.baselines where exercise_id=2147483001;
  if n<>0 then raise exception 'OAuth client read a training record'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated')::text,true);
  perform public.hypertrophy_nutrition_confirm('nutrition-isolation-dummy-1',1);
  perform public.hypertrophy_nutrition_confirm('nutrition-isolation-dummy-1',1);
  perform public.hypertrophy_nutrition_void('nutrition-isolation-dummy-1',1,true);
  perform public.hypertrophy_nutrition_void('nutrition-isolation-dummy-1',2,false);
end $$;
reset role;
do $$ declare j hypertrophy_private.nutrition_jobs; uid uuid; begin
  select * into strict j from hypertrophy_private.nutrition_jobs where id='nutrition-isolation-dummy-1';
  if j.status<>'confirmed' or (j.record->>'revision')::integer<>3 or (j.record->>'voided')::boolean then raise exception 'Confirmation/void result mismatch'; end if;
  select user_id into strict uid from hypertrophy_private.owner_registry;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare denied boolean; claims jsonb; begin
  -- Revoke the approved client and prove its existing token no longer works.
  perform public.hypertrophy_nutrition_client('nutrition-isolation-dummy-client','https://dummy.supabase.co/functions/v1/nutrition-work-mcp',false);
  claims:=current_setting('request.jwt.claims')::jsonb||'{"client_id":"nutrition-isolation-dummy-client","aud":"https://dummy.supabase.co/functions/v1/nutrition-work-mcp","scope":"openid"}';
  perform set_config('request.jwt.claims',claims::text,true);
  denied:=false;begin perform public.hypertrophy_nutrition_pending();exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Revoked client could read';end if;
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  denied:=false;begin perform public.hypertrophy_nutrition_list('2026-01-01','2026-01-01');exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Other user could read';end if;
end $$;
set local role anon;
do $$ declare denied boolean; begin
  denied:=false;begin perform public.hypertrophy_nutrition_pending();exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Anonymous access allowed';end if;
end $$;
reset role;
select true as nutrition_dummy_isolation_checks_passed;
rollback;
