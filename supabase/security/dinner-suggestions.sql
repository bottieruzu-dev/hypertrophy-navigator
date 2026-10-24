-- Additive dinner-only storage. Existing nutrition OAuth clients gain NO body/profile access.
-- Browser RPCs require the existing verified owner; worker functions are postgres-only.
begin;
do $$ begin
  if (select count(*) from hypertrophy_private.owner_registry) <> 1
    or to_regprocedure('hypertrophy_private.nutrition_require_browser()') is null then
    raise exception 'Apply owner and nutrition migrations first';
  end if;
end $$;
create table if not exists hypertrophy_private.dinner_sources (
  user_id uuid primary key references auth.users(id), snapshot jsonb not null,
  token text not null check(token ~ '^[a-f0-9]{64}$'), published_at timestamptz not null default now()
);
create table if not exists hypertrophy_private.dinner_proposals (
  user_id uuid not null references auth.users(id), date date not null,
  source_token text not null, proposal jsonb not null, generated_at timestamptz not null default now(),
  primary key(user_id,date)
);
alter table hypertrophy_private.dinner_sources enable row level security;
alter table hypertrophy_private.dinner_proposals enable row level security;
revoke all on hypertrophy_private.dinner_sources, hypertrophy_private.dinner_proposals from public, anon, authenticated, service_role;

create or replace function public.hypertrophy_dinner_source()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); result jsonb; begin
  select jsonb_build_object('token',token,'publishedAt',published_at) into result
    from hypertrophy_private.dinner_sources where user_id=uid;
  return result;
end $$;
create or replace function public.hypertrophy_dinner_publish(p_snapshot jsonb,p_expected text)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); old_token text; next_token text; k text; begin
  if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>4000000
    or coalesce(p_snapshot->>'date','') <> (clock_timestamp() at time zone 'Asia/Tokyo')::date::text
    or jsonb_typeof(p_snapshot->'profile') is distinct from 'object' then raise exception 'Invalid dinner source'; end if;
  if exists(select 1 from jsonb_object_keys(p_snapshot) a(key) where a.key not in ('date','profile','metrics','meals','workIds','sessions','sets')) then raise exception 'Unexpected source key'; end if;
  foreach k in array array['metrics','meals','workIds','sessions','sets'] loop
    if jsonb_typeof(p_snapshot->k) is distinct from 'array' then raise exception 'Invalid source list'; end if;
    if jsonb_array_length(p_snapshot->k)>10000 then raise exception 'Source list too large'; end if;
  end loop;
  perform 1 from hypertrophy_private.owner_registry where user_id=uid for update;
  select token into old_token from hypertrophy_private.dinner_sources where user_id=uid;
  next_token := encode(sha256(convert_to(p_snapshot::text,'UTF8')),'hex');
  if old_token is not distinct from next_token then return next_token; end if;
  if old_token is distinct from p_expected then raise exception 'Dinner source changed on another device'; end if;
  insert into hypertrophy_private.dinner_sources values(uid,p_snapshot,next_token,clock_timestamp())
    on conflict(user_id) do update set snapshot=excluded.snapshot,token=excluded.token,published_at=excluded.published_at;
  return next_token;
end $$;
create or replace function public.hypertrophy_dinner_get(p_date text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); result jsonb; begin
  select jsonb_build_object('proposal',proposal,'generatedAt',generated_at) into result
    from hypertrophy_private.dinner_proposals where user_id=uid and date=p_date::date;
  return result;
end $$;

-- This internal function has no ambient auth fallback. It is NOT exposed through PostgREST.
-- The approved local task calls it through the Supabase management plugin.
create or replace function hypertrophy_private.dinner_context(p_date date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare uid uuid; result jsonb; begin
  select user_id into strict uid from hypertrophy_private.owner_registry;
  select jsonb_build_object('date',p_date::text,'snapshot',s.snapshot,'publishedAt',s.published_at,
    'cloudMeals',coalesce((select jsonb_agg(j.record order by j.id) from hypertrophy_private.nutrition_jobs j
      where j.user_id=uid and j.status='confirmed' and j.record is not null and j.request->>'date' between (p_date-29)::text and p_date::text),'[]'::jsonb),
    'pendingMeals',(select count(*) from hypertrophy_private.nutrition_jobs j where j.user_id=uid and j.status in ('pending','review') and j.request->>'date'=p_date::text),
    'cloudBody',coalesce((select jsonb_agg(jsonb_build_object('date',b.date,'weightKg',b.weight_kg,'bodyFatPct',b.body_fat_pct,
      'waistCm',b.waist_cm,'navelCm',to_jsonb(b)->'navel_cm','isInterpolated',b.is_interpolated) order by b.date)
      from public.body_metrics b where b.user_id=uid and b.date between (p_date-29)::text and p_date::text),'[]'::jsonb),
    'cloudSessions',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'date',x.date,'startedAt',x.started_at,
      'finishedAt',x.finished_at,'splitType',x.split_type) order by x.id) from public.sessions x where x.user_id=uid and x.date between (p_date-29)::text and p_date::text),'[]'::jsonb),
    'cloudSets',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'date',x.date,'sessionId',x.session_id,
      'exerciseId',x.exercise_id,'actualWeight',x.actual_weight,'actualReps',x.actual_reps,'actualRir',x.actual_rir,'isWarmup',x.is_warmup) order by x.id)
      from public.sets x where x.user_id=uid and x.date between (p_date-29)::text and p_date::text),'[]'::jsonb))
    into result from (select 1) base left join hypertrophy_private.dinner_sources s on s.user_id=uid;
  if octet_length(result::text)>6000000 then raise exception 'Dinner context too large'; end if;
  return result || jsonb_build_object('token',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
end $$;
create or replace function hypertrophy_private.dinner_due()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare local_now timestamp := clock_timestamp() at time zone 'Asia/Tokyo'; uid uuid; begin
  if local_now::time < time '22:00' or local_now::time >= time '22:01' then
    return jsonb_build_object('skip','outside-start-window');
  end if;
  select user_id into strict uid from hypertrophy_private.owner_registry;
  if exists(select 1 from hypertrophy_private.dinner_proposals where user_id=uid and date=local_now::date) then
    return jsonb_build_object('skip','already-generated');
  end if;
  if not exists(select 1 from hypertrophy_private.dinner_sources where user_id=uid) then
    return jsonb_build_object('skip','source-not-synced');
  end if;
  return hypertrophy_private.dinner_context(local_now::date);
end $$;

create or replace function hypertrophy_private.dinner_valid(p jsonb,p_date date)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare o jsonb; a jsonb; k text; begin
  if p is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>100000
    or p->'version' is distinct from '1'::jsonb or p->>'date' is distinct from p_date::text
    or jsonb_typeof(p->'summary') is distinct from 'string' or length(trim(p->>'summary')) not between 1 and 2000
    or jsonb_typeof(p->'assumptions') is distinct from 'array' or jsonb_typeof(p->'options') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p->'options')<>3 or jsonb_array_length(p->'assumptions') not between 1 and 20 then return false; end if;
  for a in select value from jsonb_array_elements(p->'assumptions') loop
    if jsonb_typeof(a)<>'string' or length(trim(a#>>'{}')) not between 1 and 1000 then return false; end if;
  end loop;
  for o in select value from jsonb_array_elements(p->'options') loop
    if jsonb_typeof(o)<>'object' or coalesce(o->>'mode','') not in ('microwave','ready')
      or jsonb_typeof(o->'minutes') is distinct from 'number' or jsonb_typeof(o->'nutrients') is distinct from 'object' then return false; end if;
    if (o->>'minutes')::numeric not between 0 and 30 then return false; end if;
    foreach k in array array['title','reason','evidence'] loop
      if jsonb_typeof(o->k) is distinct from 'string' or length(trim(o->>k)) not between 1 and (case when k='title' then 200 else 2000 end) then return false; end if;
    end loop;
    foreach k in array array['foods','steps'] loop
      if jsonb_typeof(o->k) is distinct from 'array' then return false; end if;
      if jsonb_array_length(o->k) not between 1 and (case when k='foods' then 20 else 12 end) then return false; end if;
      for a in select value from jsonb_array_elements(o->k) loop
        if jsonb_typeof(a)<>'string' or length(trim(a#>>'{}')) not between 1 and 1000 then return false; end if;
      end loop;
    end loop;
    if exists(select 1 from jsonb_object_keys(o->'nutrients') n(key) where n.key not in ('energy_kcal','protein_g','fat_g','carbs_g','fiber_g','salt_g')) then return false; end if;
    foreach k in array array['energy_kcal','protein_g','fat_g','carbs_g','fiber_g','salt_g'] loop
      if not (o->'nutrients' ? k) then return false; end if;
      a:=o->'nutrients'->k;
      if a<>'null'::jsonb then
        if jsonb_typeof(a)<>'number' then return false; end if;
        if (a::text)::numeric not between 0 and 10000 then return false; end if;
      end if;
    end loop;
  end loop;
  return true;
end $$;
create or replace function hypertrophy_private.dinner_save(p_date date,p_token text,p_proposal jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare uid uuid; local_now timestamp := clock_timestamp() at time zone 'Asia/Tokyo'; wrote integer; begin
  if p_date is distinct from local_now::date or local_now::time < time '22:00' or local_now::time >= time '22:30' then
    raise exception 'Dinner save window closed';
  end if;
  select user_id into strict uid from hypertrophy_private.owner_registry;
  -- Lock all relevant source tables while verifying and saving a coherent snapshot.
  lock table hypertrophy_private.dinner_sources, hypertrophy_private.nutrition_jobs, public.body_metrics, public.sessions, public.sets in share mode;
  if p_token is distinct from hypertrophy_private.dinner_context(p_date)->>'token' then raise exception 'Dinner source changed; do not save a stale recommendation'; end if;
  if not hypertrophy_private.dinner_valid(p_proposal,p_date) then raise exception 'Invalid dinner proposal'; end if;
  insert into hypertrophy_private.dinner_proposals(user_id,date,source_token,proposal)
    values(uid,p_date,p_token,p_proposal) on conflict(user_id,date) do nothing;
  get diagnostics wrote = row_count;
  return jsonb_build_object('saved',wrote=1,'date',p_date);
end $$;

revoke all on function public.hypertrophy_dinner_source(),public.hypertrophy_dinner_publish(jsonb,text),public.hypertrophy_dinner_get(text) from public,anon,authenticated,service_role;
grant execute on function public.hypertrophy_dinner_source(),public.hypertrophy_dinner_publish(jsonb,text),public.hypertrophy_dinner_get(text) to authenticated;
revoke all on function hypertrophy_private.dinner_context(date),hypertrophy_private.dinner_due(),hypertrophy_private.dinner_valid(jsonb,date),hypertrophy_private.dinner_save(date,text,jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
