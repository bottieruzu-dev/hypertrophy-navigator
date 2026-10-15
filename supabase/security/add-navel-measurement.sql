-- Additive metadata change. Run before uploading a navel measurement.
-- No records, ownership, grants or RLS policies are changed.
begin;
alter table public.body_metrics add column if not exists navel_cm numeric;
notify pgrst,'reload schema';
commit;
