-- Metadata only: no tokens, Auth IDs or personal records are selected.
select
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='hypertrophy_private' and c.relname in ('archive_records','archive_credentials')) as private_tables_rls,
  not has_table_privilege('anon','hypertrophy_private.archive_records','SELECT')
    and not has_table_privilege('authenticated','hypertrophy_private.archive_records','SELECT') as raw_records_not_readable,
  not has_table_privilege('anon','hypertrophy_private.archive_credentials','SELECT')
    and not has_table_privilege('authenticated','hypertrophy_private.archive_credentials','SELECT') as credential_hashes_not_readable,
  not has_function_privilege('anon','public.hypertrophy_archive_pair(text)','EXECUTE')
    and not has_function_privilege('anon','public.hypertrophy_archive_publish(jsonb)','EXECUTE') as receiver_cannot_write,
  has_function_privilege('anon','public.hypertrophy_archive_export()','EXECUTE') as credential_checked_export_available;
