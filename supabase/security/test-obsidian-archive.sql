-- SQL Editor, AFTER obsidian-archive.sql. Dummy rows only, all rolled back.
-- Does not export/read workout, body, nutrition or financial record contents.
-- Does NOT test HTTP/Edge or the complete authenticated export (which would read real records).
begin;
do $test$
declare denied boolean:=false; begin
  perform set_config('request.headers','{}',true);
  begin perform public.hypertrophy_archive_export(); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Missing receiver credential accepted'; end if;
  denied:=false;
  perform set_config('request.headers','{"x-workout-archive-token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',true);
  begin perform public.hypertrophy_archive_export(); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Dummy credential accepted'; end if;
end $test$;
do $test$
declare uid uuid; dummy_id text:='archive-dummy-'||gen_random_uuid()::text; denied boolean:=false;
  payload jsonb; begin
  select user_id into strict uid from hypertrophy_private.owner_registry;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  payload:=jsonb_build_array(jsonb_build_object('kind','event','id',dummy_id,'data',jsonb_build_object('date','2000-01-01','eventType','dummy'),
    'deleted',false,'hash',repeat('1',64),'expected',null));
  perform public.hypertrophy_archive_publish(payload);
  perform public.hypertrophy_archive_publish(payload); -- Replay is idempotent.
  if (select count(*) from hypertrophy_private.archive_records where user_id=uid and kind='event' and id=dummy_id)<>1 then raise exception 'Duplicate dummy record'; end if;
  payload:=jsonb_set(payload,'{0,hash}',to_jsonb(repeat('2',64)));
  begin perform public.hypertrophy_archive_publish(payload); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Stale publication accepted'; end if;
  payload:=jsonb_set(payload,'{0,expected}',to_jsonb(repeat('1',64)));
  payload:=jsonb_set(payload,'{0,deleted}','true');
  payload:=jsonb_set(payload,'{0,data}','{}');
  perform public.hypertrophy_archive_publish(payload);
  if not (select deleted from hypertrophy_private.archive_records where user_id=uid and kind='event' and id=dummy_id) then raise exception 'Missing tombstone'; end if;
  denied:=false;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','client_id','dummy-work-client')::text,true);
  begin perform public.hypertrophy_archive_publish('[]'); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'OAuth publisher accepted'; end if;
end $test$;
select true as dummy_archive_checks_passed, true as real_records_not_exported;
rollback;
