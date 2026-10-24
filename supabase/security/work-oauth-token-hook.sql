-- Optional integration helper. Does NOT activate or replace the configured Auth Hook.
-- Review the currently configured hook first. Apply only after both feature SQL files.
begin;
create or replace function public.hypertrophy_work_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  client text := coalesce(event->>'client_id',event->'claims'->>'client_id');
  result jsonb := event;
  nutrition boolean;
  listening boolean;
begin
  -- Preserve ordinary logins byte-for-byte at the JSON level.
  if coalesce(client,'') = '' then return event; end if;
  if event->>'client_id' is not null and event->'claims'->>'client_id' is not null
    and event->>'client_id' <> event->'claims'->>'client_id' then
    raise exception 'OAuth client mismatch';
  end if;
  -- Never let one OAuth client gain both applications' claims.
  nutrition := exists(select 1 from hypertrophy_private.nutrition_clients n where n.client_id=client);
  listening := exists(select 1 from public.listening_lab_quiz_connections q where q.client_id=client);
  if nutrition and listening then
    raise exception 'Separate OAuth clients required';
  end if;
  if not nutrition and not listening then return event; end if;
  -- Listening Lab reads client_id from claims; normalize the trusted Auth event.
  result := jsonb_set(result,'{claims,client_id}',to_jsonb(client));
  result := public.hypertrophy_nutrition_token_hook(result);
  result := public.listening_quiz_token_hook(result);
  return result;
end $$;
revoke all on function public.hypertrophy_work_token_hook(jsonb) from public,anon,authenticated;
grant execute on function public.hypertrophy_work_token_hook(jsonb) to supabase_auth_admin;
commit;
