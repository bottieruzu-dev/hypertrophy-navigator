-- Apply AFTER restore-owner-sync.sql and nutrition-work.sql. No existing data/policies/grants change.
-- Personal archive only. The receiver credential cannot write app data or read other apps.
begin;
do $$ begin
  if (select count(*) from hypertrophy_private.owner_registry) <> 1 then raise exception 'Single owner required'; end if;
  if to_regclass('hypertrophy_private.nutrition_jobs') is null then raise exception 'Nutrition work migration required'; end if;
end $$;
create table if not exists hypertrophy_private.archive_records (
  user_id uuid not null references auth.users(id), kind text not null, id text not null,
  data jsonb not null, deleted boolean not null, hash text not null,
  primary key(user_id,kind,id)
);
create table if not exists hypertrophy_private.archive_credentials (
  user_id uuid primary key references auth.users(id), token_hash text not null,
  expires_at timestamptz not null
);
alter table hypertrophy_private.archive_records enable row level security;
alter table hypertrophy_private.archive_credentials enable row level security;
revoke all on hypertrophy_private.archive_records, hypertrophy_private.archive_credentials from public,anon,authenticated;

create or replace function public.hypertrophy_archive_pair(p_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); begin
  if p_hash is null then delete from hypertrophy_private.archive_credentials where user_id=uid; return; end if;
  if p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid hash'; end if;
  insert into hypertrophy_private.archive_credentials values(uid,p_hash,now()+interval '400 days')
    on conflict(user_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at;
end $$;

create or replace function public.hypertrophy_archive_publish(p_records jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.nutrition_require_browser(); r jsonb; old_hash text; begin
  if jsonb_typeof(p_records) is distinct from 'array' or octet_length(p_records::text)>12000000 then raise exception 'Invalid archive'; end if;
  if jsonb_array_length(p_records)>100000 then raise exception 'Archive too large'; end if;
  -- Serialize browser publications and make every batch all-or-nothing.
  perform 1 from hypertrophy_private.owner_registry where user_id=uid for update;
  for r in select value from jsonb_array_elements(p_records) loop
    if coalesce(r->>'kind','') not in ('exercise','baseline','session','set','body','legacy','cardio','event','plan','meal')
      or coalesce(length(r->>'id'),0) not between 1 and 100
      or jsonb_typeof(r->'data') is distinct from 'object'
      or jsonb_typeof(r->'deleted') is distinct from 'boolean'
      or coalesce(r->>'hash','') !~ '^[a-f0-9]{64}$'
      or (r->>'expected' is not null and r->>'expected' !~ '^[a-f0-9]{64}$')
      or octet_length(r::text)>600000 then raise exception 'Invalid record'; end if;
    -- Do not store an accidentally supplied profile/auth object.
    if r->>'kind'='meal' then r:=jsonb_set(r,'{data}',(r->'data') #- '{targets,profile}'); end if;
    select hash into old_hash from hypertrophy_private.archive_records where user_id=uid and kind=r->>'kind' and id=r->>'id';
    if old_hash is not distinct from r->>'hash' then continue; end if; -- Safe replay after lost response.
    if old_hash is distinct from r->>'expected' then raise exception 'Archive revision conflict'; end if;
    insert into hypertrophy_private.archive_records values(uid,r->>'kind',r->>'id',r->'data',(r->>'deleted')::boolean,r->>'hash')
      on conflict(user_id,kind,id) do update set data=excluded.data,deleted=excluded.deleted,hash=excluded.hash;
  end loop;
end $$;

-- Not exposed: a separate header credential, not the browser's JWT or Work client.
create or replace function hypertrophy_private.archive_reader()
returns uuid language plpgsql security definer set search_path = '' as $$
declare token text := coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-workout-archive-token',''); uid uuid; begin
  if token !~ '^[a-f0-9]{64}$' then raise insufficient_privilege using message='Archive credential required'; end if;
  select c.user_id into uid from hypertrophy_private.archive_credentials c
    join hypertrophy_private.owner_registry o on o.user_id=c.user_id
    where c.token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') and c.expires_at>now();
  if uid is null then raise insufficient_privilege using message='Archive credential required'; end if;
  return uid;
end $$;
revoke all on function hypertrophy_private.archive_reader() from public,anon,authenticated;

create or replace function public.hypertrophy_archive_export()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := hypertrophy_private.archive_reader(); result jsonb; begin
  -- One SQL statement is a coherent full snapshot. No partial pages can look like deletions.
  -- Confirmed Work records are authoritative; the archive supplements cloud-only historical data.
  with candidates(kind,id,data,deleted,priority) as (
    select 'session',s.id::text,to_jsonb(s)-'user_id',false,1 from public.sessions s where s.user_id=uid
    union all select 'set',s.id::text,to_jsonb(s)-'user_id',false,1 from public.sets s where s.user_id=uid
    union all select 'body',b.date::text,to_jsonb(b)-'user_id',false,1 from public.body_metrics b where b.user_id=uid
    union all select 'baseline',b.exercise_id::text,to_jsonb(b)-'user_id',false,1 from public.baselines b where b.user_id=uid
    union all select 'legacy',n.date::text,to_jsonb(n)-'user_id',false,1 from public.nutrition_logs n where n.user_id=uid
    union all select 'exercise',e.id::text,to_jsonb(e)-'user_id',false,1 from public.exercises e
    union all select a.kind,a.id,a.data,a.deleted,2 from hypertrophy_private.archive_records a where a.user_id=uid
    union all select 'meal',j.id,j.record #- '{targets,profile}',false,3
      from hypertrophy_private.nutrition_jobs j where j.user_id=uid and j.status='confirmed' and j.record is not null
  ), chosen as (
    select distinct on(kind,id) kind,id,data,deleted from candidates order by kind,id,priority desc
  ) select jsonb_build_object('schemaVersion',1,'complete',true,'count',count(*),
      'records',coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'data',data,'deleted',deleted) order by kind,id),'[]'::jsonb))
    into result from chosen;
  -- Fail closed instead of truncating history. Growth beyond this requires paginated frozen snapshots.
  if octet_length(result::text)>20000000 or (result->>'count')::integer>100000 then raise exception 'Archive capacity exceeded'; end if;
  return result;
end $$;
revoke all on function public.hypertrophy_archive_pair(text), public.hypertrophy_archive_publish(jsonb), public.hypertrophy_archive_export() from public,anon,authenticated;
grant execute on function public.hypertrophy_archive_pair(text), public.hypertrophy_archive_publish(jsonb) to authenticated;
-- Only this credential-checked, read-only, bounded function is callable with the public project key.
grant execute on function public.hypertrophy_archive_export() to anon,authenticated;
notify pgrst,'reload schema';
commit;
