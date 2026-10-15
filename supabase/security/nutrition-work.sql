-- Additive single-owner nutrition queue. Apply AFTER restore-owner-sync.sql.
-- No existing records are removed. No UUIDs/keys need editing in this file.
begin;
do $$ begin
  if (select count(*) from hypertrophy_private.owner_registry) <> 1 then
    raise exception 'Complete the single-owner migration first';
  end if;
end $$;
create table if not exists hypertrophy_private.nutrition_jobs (
  user_id uuid not null references auth.users(id),
  id text not null check (length(id) between 1 and 100),
  request jsonb not null, targets jsonb not null,
  status text not null default 'pending' check (status in ('pending','review','confirmed','cancelled')),
  response jsonb, response_revision integer not null default 0,
  version integer not null default 1,
  record jsonb,
  primary key(user_id,id)
);
create table if not exists hypertrophy_private.nutrition_clients (
  user_id uuid not null references auth.users(id),
  client_id text not null, resource text not null check (resource ~ '^https://'),
  enabled boolean not null default true,
  primary key(user_id,client_id)
);
alter table hypertrophy_private.nutrition_jobs enable row level security;
alter table hypertrophy_private.nutrition_clients enable row level security;
revoke all on hypertrophy_private.nutrition_jobs, hypertrophy_private.nutrition_clients from public, anon, authenticated;

-- Explicit caller checks are necessary because these narrow RPCs own private tables.
create or replace function hypertrophy_private.nutrition_require_browser()
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); begin
  if uid is null or not public.hypertrophy_cloud_access() or coalesce(auth.jwt()->>'client_id','') <> '' then
    raise insufficient_privilege using message = 'Owner browser login required';
  end if;
  return uid;
end $$;
create or replace function hypertrophy_private.nutrition_require_worker()
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); begin
  if uid is null or not public.hypertrophy_cloud_access() or not exists (
    select 1 from hypertrophy_private.nutrition_clients c where c.user_id = uid and c.enabled
    and c.client_id = auth.jwt()->>'client_id' and c.resource = auth.jwt()->>'aud'
  ) or not ('openid' = any(string_to_array(coalesce(auth.jwt()->>'scope',''),' '))) then
    raise insufficient_privilege using message = 'Approved nutrition OAuth client required';
  end if;
  return uid;
end $$;
revoke all on function hypertrophy_private.nutrition_require_browser(), hypertrophy_private.nutrition_require_worker() from public,anon,authenticated;

create or replace function public.hypertrophy_nutrition_client(p_client_id text, p_resource text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); begin
  if length(p_client_id) not between 1 and 200 or p_resource !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/nutrition-work-mcp$' then
    raise exception 'Invalid client or resource';
  end if;
  insert into hypertrophy_private.nutrition_clients(user_id,client_id,resource,enabled)
    values(uid,p_client_id,p_resource,p_enabled)
    on conflict(user_id,client_id) do update set resource=excluded.resource,enabled=excluded.enabled;
end $$;
create or replace function public.hypertrophy_nutrition_clients()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); result jsonb; begin
  select coalesce(jsonb_agg(jsonb_build_object('clientId',client_id,'resource',resource,'enabled',enabled)),'[]'::jsonb)
    into result from hypertrophy_private.nutrition_clients where user_id=uid;
  return result;
end $$;

create or replace function public.hypertrophy_nutrition_enqueue(p_request jsonb, p_targets jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); j hypertrophy_private.nutrition_jobs; begin
  if jsonb_typeof(p_request) <> 'object' or jsonb_typeof(p_targets) <> 'object'
    or coalesce(length(p_request->>'id'),0) not between 1 and 100
    or coalesce(p_request->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_request->>'meal','') not in ('breakfast','lunch','dinner','snack')
    or jsonb_typeof(p_request->'items') is distinct from 'array'
    or p_request->>'date' is distinct from p_targets->>'date'
    or jsonb_typeof(p_targets->'profile') is distinct from 'object'
    or octet_length(p_request::text) > 250000 or octet_length(p_targets::text) > 50000 then raise exception 'Invalid meal request'; end if;
  if jsonb_array_length(p_request->'items') not between 1 and 100 then raise exception 'Invalid food count'; end if;
  -- Serialize owner mutations, including replacement and cancellation races.
  perform 1 from hypertrophy_private.owner_registry where user_id=uid for update;
  insert into hypertrophy_private.nutrition_jobs(user_id,id,request,targets)
    values(uid,p_request->>'id',p_request,p_targets) on conflict do nothing;
  select * into strict j from hypertrophy_private.nutrition_jobs where user_id=uid and id=p_request->>'id';
  if j.request <> p_request or j.targets <> p_targets then raise exception 'Immutable request conflict'; end if;
  return to_jsonb(j)-'user_id';
end $$;
create or replace function public.hypertrophy_nutrition_list(p_from text,p_to text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); result jsonb; begin
  if (p_to::date-p_from::date) not between 0 and 31 then raise exception 'Invalid date range'; end if;
  select coalesce(jsonb_agg(to_jsonb(j)-'user_id'),'[]'::jsonb) into result
    from hypertrophy_private.nutrition_jobs j where user_id=uid and request->>'date' between p_from and p_to;
  return result;
end $$;
create or replace function public.hypertrophy_nutrition_cancel(p_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); begin
  perform 1 from hypertrophy_private.owner_registry where user_id=uid for update;
  update hypertrophy_private.nutrition_jobs set status='cancelled',version=version+1
    where user_id=uid and id=p_id and status in ('pending','review');
end $$;
create or replace function public.hypertrophy_nutrition_pending()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_worker(); result jsonb; begin
  select coalesce(jsonb_agg(jsonb_build_object('request',j.request,'responseRevision',j.response_revision)),'[]'::jsonb)
    into result from (select request,response_revision from hypertrophy_private.nutrition_jobs
      where user_id=uid and status='pending' order by request->>'createdAt',id limit 5) j;
  return result;
end $$;
create or replace function public.hypertrophy_nutrition_save_draft(p_id text,p_response_revision integer,p_response jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_worker(); j hypertrophy_private.nutrition_jobs; food jsonb; answer jsonb; nutrient record;
allowed_keys text[] := array['energy_kcal','protein_g','fat_g','carbs_g','fiber_g','salt_g','saturated_fat_g','omega3_g','omega6_g',
  'vitamin_a_ug_rae','vitamin_d_ug','vitamin_e_mg','vitamin_k_ug','vitamin_b1_mg','vitamin_b2_mg','niacin_mg_ne',
  'vitamin_b6_mg','vitamin_b12_ug','folate_ug','pantothenic_acid_mg','biotin_ug','vitamin_c_mg','calcium_mg',
  'magnesium_mg','phosphorus_mg','potassium_mg','iron_mg','zinc_mg','copper_mg','manganese_mg','iodine_ug','selenium_ug','chromium_ug','molybdenum_ug'];
begin
  perform 1 from hypertrophy_private.owner_registry where user_id=uid for update;
  select * into strict j from hypertrophy_private.nutrition_jobs where user_id=uid and id=p_id for update;
  if j.status not in ('pending','review') then raise exception 'Request is closed'; end if;
  if j.response=p_response then return jsonb_build_object('saved',true,'responseRevision',j.response_revision); end if;
  if p_response_revision is null or j.response_revision<>p_response_revision or octet_length(p_response::text)>500000
    or p_response->>'requestId' is distinct from p_id or p_response->>'date' is distinct from j.request->>'date'
    or p_response->>'meal' is distinct from j.request->>'meal' or p_response->>'basis' is distinct from 'consumed'
    or p_response->'version' is distinct from '1'::jsonb or jsonb_typeof(p_response->'items') is distinct from 'array'
    then raise exception 'Response version or request mismatch'; end if;
  if jsonb_array_length(p_response->'items')<>jsonb_array_length(j.request->'items') then raise exception 'Food count mismatch'; end if;
  for food in select value from jsonb_array_elements(j.request->'items') loop
    if (select count(*) from jsonb_array_elements(p_response->'items') a where a->>'id'=food->>'id')<>1 then raise exception 'Food id mismatch'; end if;
    select value into answer from jsonb_array_elements(p_response->'items') where value->>'id'=food->>'id';
    if answer->'quantity' is distinct from food->'quantity' or answer->>'unit' is distinct from food->>'unit'
      or jsonb_typeof(answer->'nutrients') is distinct from 'object' then raise exception 'Food quantity mismatch'; end if;
    if jsonb_typeof(answer->'source') is distinct from 'string' or jsonb_typeof(answer->'assumptions') is distinct from 'string'
      or length(answer->>'source')>2000 or length(answer->>'assumptions')>2000 then raise exception 'Invalid evidence'; end if;
    if not (answer ? 'edibleGrams') or (answer->'edibleGrams'<>'null'::jsonb and
      (jsonb_typeof(answer->'edibleGrams')<>'number' or (answer->>'edibleGrams')::numeric<=0 or (answer->>'edibleGrams')::numeric>10000)) then raise exception 'Invalid edible weight'; end if;
    for nutrient in select key,value from jsonb_each(answer->'nutrients') loop
      if not (nutrient.key=any(allowed_keys)) then raise exception 'Unknown nutrient'; end if;
      if nutrient.value<>'null'::jsonb then
        if jsonb_typeof(nutrient.value)<>'number' then raise exception 'Invalid nutrient number'; end if;
        if (nutrient.value::text)::numeric not between 0 and 1000000 or length(trim(answer->>'source'))=0 then raise exception 'Invalid value or missing evidence'; end if;
      end if;
    end loop;
  end loop;
  update hypertrophy_private.nutrition_jobs set response=p_response,response_revision=response_revision+1,status='review',version=version+1
    where user_id=uid and id=p_id returning * into j;
  return jsonb_build_object('saved',true,'responseRevision',j.response_revision);
end $$;
create or replace function public.hypertrophy_nutrition_get(p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_worker(); result jsonb; begin
  select jsonb_build_object('request',request,'responseRevision',response_revision) into result
    from hypertrophy_private.nutrition_jobs where user_id=uid and id=p_id and status in ('pending','review');
  if result is null then raise exception 'Request is closed or missing'; end if;
  return result;
end $$;
create or replace function public.hypertrophy_nutrition_confirm(p_id text,p_response_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); j hypertrophy_private.nutrition_jobs; old hypertrophy_private.nutrition_jobs; begin
  perform 1 from hypertrophy_private.owner_registry where user_id=uid for update;
  select * into strict j from hypertrophy_private.nutrition_jobs where user_id=uid and id=p_id for update;
  if j.status='confirmed' and j.response_revision=p_response_revision then return; end if;
  if p_response_revision is null or j.status<>'review' or j.response is null or j.response_revision<>p_response_revision then raise exception 'Review the latest draft'; end if;
  if j.request ? 'replaces' then
    select * into old from hypertrophy_private.nutrition_jobs where user_id=uid and id=j.request->'replaces'->>'id' for update;
    if not found then raise exception 'Only cloud meals may be replaced through Work'; end if;
    if old.status<>'confirmed' or (old.record->>'voided')::boolean or old.record->'revision' is distinct from j.request->'replaces'->'revision'
      or old.request->>'date' is distinct from j.request->>'date' then raise exception 'Replacement source changed'; end if;
    update hypertrophy_private.nutrition_jobs set record=jsonb_set(jsonb_set(record,'{voided}','true'),'{revision}',to_jsonb((record->>'revision')::integer+1)),version=version+1
      where user_id=uid and id=old.id;
  end if;
  update hypertrophy_private.nutrition_jobs set status='confirmed',version=version+1,
    record=jsonb_build_object('id',id,'request',request,'response',response,'targets',targets,'revision',1,
      'savedAt',floor(extract(epoch from clock_timestamp())*1000),'voided',false)
    where user_id=uid and id=p_id;
end $$;
create or replace function public.hypertrophy_nutrition_void(p_id text,p_revision integer,p_voided boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); j hypertrophy_private.nutrition_jobs; begin
  perform 1 from hypertrophy_private.owner_registry where user_id=uid for update;
  select * into strict j from hypertrophy_private.nutrition_jobs where user_id=uid and id=p_id for update;
  if p_revision is null or p_voided is null or j.status<>'confirmed' or (j.record->>'revision')::integer<>p_revision then raise exception 'Record changed'; end if;
  if not p_voided and exists(select 1 from hypertrophy_private.nutrition_jobs n where n.user_id=uid and n.status='confirmed'
    and n.request->'replaces'->>'id'=p_id and (n.record->>'voided')::boolean=false) then raise exception 'An active replacement exists'; end if;
  if (j.record->>'voided')::boolean=p_voided then return; end if;
  update hypertrophy_private.nutrition_jobs set record=jsonb_set(jsonb_set(record,'{voided}',to_jsonb(p_voided)),'{revision}',to_jsonb(p_revision+1)),version=version+1
    where user_id=uid and id=p_id;
end $$;

-- Hook is created but NOT enabled automatically. Preserve any existing Auth hook.
create or replace function public.hypertrophy_nutrition_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb := event->'claims'; resource text; begin
  select c.resource into resource from hypertrophy_private.nutrition_clients c
    where c.enabled and c.user_id=(event->>'user_id')::uuid
    and c.client_id=coalesce(event->>'client_id',claims->>'client_id');
  if resource is not null then
    claims := jsonb_set(claims,'{aud}',to_jsonb(resource));
    claims := jsonb_set(claims,'{client_id}',to_jsonb(coalesce(event->>'client_id',claims->>'client_id')));
    -- The explicit owner registry is the grant. Supabase need not include OIDC scope in the JWT by default.
    claims := jsonb_set(claims,'{scope}','"openid"'::jsonb);
  end if;
  return jsonb_set(event,'{claims}',claims);
end $$;
revoke all on function public.hypertrophy_nutrition_token_hook(jsonb) from public,anon,authenticated;
grant execute on function public.hypertrophy_nutrition_token_hook(jsonb) to supabase_auth_admin;

-- OAuth tokens cannot use the existing training tables, even when owned by the same person.
do $$ declare t text; begin
  foreach t in array array['baselines','sessions','sets','body_metrics','nutrition_logs','exercises','muscle_credits'] loop
    execute format('drop policy if exists hypertrophy_browser_only on public.%I',t);
    execute format('create policy hypertrophy_browser_only on public.%I as restrictive for all to public using (coalesce((select auth.jwt())->>''client_id'','''')='''') with check (coalesce((select auth.jwt())->>''client_id'','''')='''')',t);
  end loop;
end $$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('hypertrophy_nutrition_client','hypertrophy_nutrition_clients','hypertrophy_nutrition_enqueue',
      'hypertrophy_nutrition_list','hypertrophy_nutrition_cancel','hypertrophy_nutrition_pending','hypertrophy_nutrition_get','hypertrophy_nutrition_save_draft',
      'hypertrophy_nutrition_confirm','hypertrophy_nutrition_void') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
