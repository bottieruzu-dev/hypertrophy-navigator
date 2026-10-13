-- Optional SQL Editor test AFTER restore-owner-sync.sql.
-- Uses only dummy fixtures, checks SELECT/INSERT/UPDATE/DELETE, always ROLLBACK.
-- No real records, owner UUIDs or credentials are returned.
-- Run the ENTIRE file together. If an assertion fails, execute ROLLBACK.
begin;
create temporary table hypertrophy_test_fixtures (table_name text, predicate text, insert_sql text, personal boolean);
insert into hypertrophy_test_fixtures values
('baselines', 'exercise_id = 2147483000', 'insert into public.baselines(exercise_id,weight_kg,reps,rir,est1rm,calibrated_at) values(2147483000,20,8,2,26,1)', true),
('body_metrics', 'date = ''9999-12-30''', 'insert into public.body_metrics(date,weight_kg) values(''9999-12-30'',60)', true),
('nutrition_logs', 'date = ''9999-12-30''', 'insert into public.nutrition_logs(date,estimated_tdee,target_kcal,target_p,target_f,target_c,protein_coef) values(''9999-12-30'',2000,1800,120,50,217.5,2)', true),
('sessions', 'id = 8000000000000001', 'insert into public.sessions(id,date,started_at,split_type,mesocycle_week,is_deload) values(8000000000000001,''9999-12-30'',1,''upper_A'',1,0)', true),
('sets', 'id = 8000000000000002', 'insert into public.sets(id,session_id,exercise_id,date,set_order,target_weight,actual_weight,target_reps,actual_reps,target_rir,actual_rir,volume_load,est1rm,is_warmup,mode) values(8000000000000002,8000000000000001,2147483000,''9999-12-30'',1,20,20,8,8,2,2,160,26,0,''load'')', true),
('exercises', 'id = 2147483000', 'insert into public.exercises(id,name,equipment,type,increment,rest_sec,silhouette_tag,rep_range_low,rep_range_high,is_available) values(2147483000,''Dummy test exercise'',''dummy'',''compound'',1,120,''dummy'',8,12,1)', false),
('muscle_credits', 'exercise_id = 2147483000', 'insert into public.muscle_credits(exercise_id,muscle,credit) values(2147483000,''dummy'',1)', false);
grant select on hypertrophy_test_fixtures to anon, authenticated;

do $setup$
declare fixture record; n bigint; owner_id uuid;
begin
  select user_id into strict owner_id from hypertrophy_private.owner_registry;
  if owner_id = '00000000-0000-0000-0000-000000000001' then
    raise exception 'Dummy alternate identity collides with the owner.';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub',owner_id,'role','authenticated')::text, true);
  -- Abort on collision rather than touching any existing record.
  for fixture in select * from hypertrophy_test_fixtures loop
    execute format('select count(*) from public.%I where %s', fixture.table_name, fixture.predicate) into n;
    if n <> 0 then raise exception 'Dummy fixture collision: %', fixture.table_name; end if;
  end loop;
  -- Seed catalogue only as SQL Editor owner; clients must not mutate it.
  for fixture in select * from hypertrophy_test_fixtures where not personal loop
    execute fixture.insert_sql;
  end loop;
end;
$setup$;

set local role authenticated;
do $owner$
declare fixture record; n bigint; denied boolean;
begin
  if not public.hypertrophy_cloud_access() then raise exception 'Owner RPC failed'; end if;
  -- Insert parent sessions before sets, and exercise catalogue is already present.
  for fixture in select * from hypertrophy_test_fixtures where personal
    order by case table_name when 'sessions' then 0 when 'sets' then 2 else 1 end loop
    execute fixture.insert_sql;
  end loop;
  for fixture in select * from hypertrophy_test_fixtures loop
    execute format('select count(*) from public.%I where %s', fixture.table_name, fixture.predicate) into n;
    if n <> 1 then raise exception 'Owner SELECT failed: %', fixture.table_name; end if;
    if fixture.personal then
      execute format('update public.%I set user_id = user_id where %s', fixture.table_name, fixture.predicate);
      get diagnostics n = row_count;
      if n <> 1 then raise exception 'Owner UPDATE failed: %', fixture.table_name; end if;
    else
      denied := false;
      begin execute fixture.insert_sql; exception when insufficient_privilege then denied := true; end;
      if not denied then raise exception 'Catalogue INSERT was not denied: %', fixture.table_name; end if;
      denied := false;
      begin execute format('delete from public.%I where %s',fixture.table_name,fixture.predicate);
      exception when insufficient_privilege then denied := true; end;
      if not denied then raise exception 'Catalogue DELETE was not denied: %',fixture.table_name; end if;
      denied := false;
      begin execute format('update public.%I set %I = %I where %s',fixture.table_name,
        case when fixture.table_name = 'exercises' then 'name' else 'muscle' end,
        case when fixture.table_name = 'exercises' then 'name' else 'muscle' end,fixture.predicate);
      exception when insufficient_privilege then denied := true; end;
      if not denied then raise exception 'Catalogue UPDATE was not denied: %',fixture.table_name; end if;
    end if;
  end loop;
end;
$owner$;

-- A different signed-in identity cannot access even these dummy records.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true) is not null as alternate_dummy_identity_set;
do $other$
declare fixture record; n bigint; denied boolean;
begin
  if public.hypertrophy_cloud_access() then raise exception 'Other user RPC was allowed'; end if;
  for fixture in select * from hypertrophy_test_fixtures loop
    execute format('select count(*) from public.%I where %s',fixture.table_name,fixture.predicate) into n;
    if n <> 0 then raise exception 'Other user SELECT leaked: %',fixture.table_name; end if;
    denied := false;
    begin execute fixture.insert_sql; exception when insufficient_privilege then denied := true; end;
    if not denied then raise exception 'Other user INSERT allowed: %',fixture.table_name; end if;
    -- Catalogue write privileges are absent; personal writes must affect zero rows.
    if fixture.personal then
      execute format('update public.%I set user_id = user_id where %s',fixture.table_name,fixture.predicate);
      get diagnostics n = row_count;
      if n <> 0 then raise exception 'Other user UPDATE allowed'; end if;
      execute format('delete from public.%I where %s',fixture.table_name,fixture.predicate);
      get diagnostics n = row_count;
      if n <> 0 then raise exception 'Other user DELETE allowed'; end if;
    end if;
  end loop;
end;
$other$;

set local role anon;
do $anon$
declare fixture record; statement text; denied boolean;
begin
  for fixture in select * from hypertrophy_test_fixtures loop
    foreach statement in array array[
      format('select 1 from public.%I where %s',fixture.table_name,fixture.predicate),
      fixture.insert_sql,
      format('delete from public.%I where %s',fixture.table_name,fixture.predicate),
      format('update public.%I set %I = %I where %s',fixture.table_name,
        case when fixture.table_name = 'exercises' then 'name' when fixture.table_name = 'muscle_credits' then 'muscle' else 'user_id' end,
        case when fixture.table_name = 'exercises' then 'name' when fixture.table_name = 'muscle_credits' then 'muscle' else 'user_id' end,fixture.predicate)
    ] loop
      denied := false;
      begin execute statement; exception when insufficient_privilege then denied := true; end;
      if not denied then raise exception 'Anonymous access not denied: %',fixture.table_name; end if;
    end loop;
  end loop;
end;
$anon$;
reset role;
-- Owner DELETE test, removing sets before the parent session.
do $owner_again$
declare owner_id uuid;
begin
  select user_id into strict owner_id from hypertrophy_private.owner_registry;
  perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
end;
$owner_again$;
set local role authenticated;
do $delete$
declare fixture record; n bigint;
begin
  for fixture in select * from hypertrophy_test_fixtures where personal
    order by case table_name when 'sets' then 0 when 'sessions' then 2 else 1 end loop
    execute format('delete from public.%I where %s',fixture.table_name,fixture.predicate);
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'Owner DELETE failed: %',fixture.table_name; end if;
  end loop;
end;
$delete$;
rollback;
