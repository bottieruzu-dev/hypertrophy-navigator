-- METADATA ONLY: no table contents, auth users, keys, or default-value expressions.
-- Needed before preparing a migration that preserves existing keys and relationships.
with expected(table_name) as (
  values ('sets'), ('body_metrics'), ('exercises'), ('muscle_credits'),
         ('baselines'), ('sessions'), ('nutrition_logs')
)
select e.table_name,
       coalesce((select jsonb_agg(jsonb_build_object(
         'column', c.column_name, 'type', c.udt_name, 'nullable', c.is_nullable
       ) order by c.ordinal_position)
         from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = e.table_name), '[]'::jsonb) as columns,
       coalesce((select jsonb_agg(jsonb_build_object(
         'name', con.conname, 'kind', con.contype,
         'columns', (select array_agg(a.attname order by k.ord)
           from unnest(con.conkey) with ordinality k(attnum, ord)
           join pg_catalog.pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum),
         'reference_schema', rn.nspname, 'reference_table', rc.relname,
         'reference_columns', (select array_agg(a.attname order by k.ord)
           from unnest(con.confkey) with ordinality k(attnum, ord)
           join pg_catalog.pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum)
       ) order by con.conname)
         from pg_catalog.pg_constraint con
         left join pg_catalog.pg_class rc on rc.oid = con.confrelid
         left join pg_catalog.pg_namespace rn on rn.oid = rc.relnamespace
         where con.conrelid = t.oid and con.contype in ('p','u','f')), '[]'::jsonb) as constraints
from expected e
left join pg_catalog.pg_namespace n on n.nspname = 'public'
left join pg_catalog.pg_class t on t.relnamespace = n.oid and t.relname = e.table_name
order by e.table_name;
