-- Run in the SAME transaction as the migration, or after it. This file always rolls back.
-- Only synthetic dinner data is written; existing app records are not modified.
do $$
declare uid uuid; source jsonb; token text; before_token text; proposal jsonb; option jsonb; context jsonb; definition text; today date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
begin
  select user_id into strict uid from hypertrophy_private.owner_registry;
  if has_table_privilege('anon','hypertrophy_private.dinner_sources','select')
    or has_table_privilege('authenticated','hypertrophy_private.dinner_proposals','insert')
    or has_function_privilege('authenticated','hypertrophy_private.dinner_context(date)','execute')
    or has_function_privilege('anon','public.hypertrophy_dinner_get(text)','execute')
    or has_function_privilege('service_role','hypertrophy_private.dinner_save(date,text,jsonb)','execute') then raise exception 'Dinner grants too broad'; end if;
  if not (select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='hypertrophy_private' and c.relname in ('dinner_sources','dinner_proposals')) then raise exception 'RLS required'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  select s.token into before_token from hypertrophy_private.dinner_sources s where s.user_id=uid;
  source:=jsonb_build_object('date',(clock_timestamp() at time zone 'Asia/Tokyo')::date::text,
    'profile',jsonb_build_object('age',28,'sex','male','menstruating',false,'heightCm',170,'initialWeightKg',65,'activityFactor',1.55,'deficitFraction',0.15,'energyOverride',null),
    'metrics','[]'::jsonb,'meals','[]'::jsonb,'workIds','[]'::jsonb,'sessions','[]'::jsonb,'sets','[]'::jsonb);
  token:=public.hypertrophy_dinner_publish(source,before_token);
  if token is distinct from public.hypertrophy_dinner_publish(source,null) then raise exception 'Idempotent replay failed'; end if;
  begin
    perform public.hypertrophy_dinner_publish(jsonb_set(source,'{profile,age}','29'),null);
    raise exception 'Stale source was accepted';
  exception when raise_exception then if sqlerrm<>'Dinner source changed on another device' then raise; end if; end;
  context:=hypertrophy_private.dinner_context((clock_timestamp() at time zone 'Asia/Tokyo')::date);
  if context->>'token' !~ '^[a-f0-9]{64}$' or context->'snapshot' is distinct from source then raise exception 'Context mismatch'; end if;
  option:='{"title":"架空の夕食","mode":"ready","minutes":10,"foods":["架空食品 100g"],"steps":["盛り付ける"],"nutrients":{"energy_kcal":300,"protein_g":20,"fat_g":10,"carbs_g":30,"fiber_g":null,"salt_g":1},"reason":"テスト","evidence":"架空データ"}';
  proposal:=jsonb_build_object('version',1,'date','2026-10-23','summary','テスト','assumptions',jsonb_build_array('推定のテスト'),'options',jsonb_build_array(option,option,option));
  if not hypertrophy_private.dinner_valid(proposal,'2026-10-23') then raise exception 'Valid proposal rejected'; end if;
  if hypertrophy_private.dinner_valid(jsonb_set(proposal,'{options,0,minutes}','31'),'2026-10-23')
    or hypertrophy_private.dinner_valid(jsonb_set(proposal,'{options,0,nutrients,protein_g}','-1'),'2026-10-23')
    or hypertrophy_private.dinner_valid(proposal-'assumptions','2026-10-23')
    or hypertrophy_private.dinner_valid(proposal,'2026-10-24') then raise exception 'Bad proposal accepted'; end if;
  begin
    perform hypertrophy_private.dinner_save('2026-10-22',repeat('a',64),proposal);
    raise exception 'Backfill accepted';
  exception when raise_exception then if sqlerrm<>'Dinner save window closed' then raise; end if; end;
  -- Inject 22:05 into the test transaction only. These function changes roll back too.
  -- Production has no caller-supplied clock or bypass flag.
  select pg_get_functiondef('hypertrophy_private.dinner_save(date,text,jsonb)'::regprocedure) into definition;
  execute replace(definition, 'clock_timestamp() at time zone ''Asia/Tokyo''',
    '(clock_timestamp() at time zone ''Asia/Tokyo'')::date + time ''22:05''');
  -- A test run after deployment must not overwrite an existing recommendation.
  if not exists(select 1 from hypertrophy_private.dinner_proposals d where d.user_id=uid and d.date=today) then
    proposal:=jsonb_set(proposal,'{date}',to_jsonb(today::text));
    if hypertrophy_private.dinner_save(today,context->>'token',proposal)->'saved' <> 'true'::jsonb then raise exception 'First save failed'; end if;
    if hypertrophy_private.dinner_save(today,context->>'token',proposal)->'saved' <> 'false'::jsonb then raise exception 'Duplicate save accepted'; end if;
    perform public.hypertrophy_dinner_publish(jsonb_set(source,'{profile,age}','29'),token);
    begin
      perform hypertrophy_private.dinner_save(today,context->>'token',proposal); raise exception 'Stale generation accepted';
    exception when raise_exception then if sqlerrm<>'Dinner source changed; do not save a stale recommendation' then raise; end if; end;
  end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','client_id','dinner-denied-test')::text,true);
  begin
    perform public.hypertrophy_dinner_get('2026-10-23'); raise exception 'Nutrition OAuth gained dinner access';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-000000000001','role','authenticated')::text,true);
  begin
    perform public.hypertrophy_dinner_source(); raise exception 'Other user gained source access';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.hypertrophy_dinner_get('2026-10-23'); raise exception 'Anonymous gained dinner access';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'dinner integration assertions passed; all test changes rolled back' as result;
