import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createArchiveHandler } from './handler';
const base = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_ANON_KEY')!;
Deno.serve(createArchiveHandler(async token => {
  const client = createClient(base,key,{global:{headers:{'X-Workout-Archive-Token':token}},auth:{persistSession:false,autoRefreshToken:false}});
  const result = await client.rpc('hypertrophy_archive_export');
  if (result.error) throw new Error('ARCHIVE_UNAVAILABLE');
  return result.data;
}));
