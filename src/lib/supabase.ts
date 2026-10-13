import { createClient } from '@supabase/supabase-js';
import { cloudClientForApp, publicCloudConfig } from './cloudPolicy';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Invalid or missing configuration must not prevent local gym logging.
function configuredClient() {
  if (!publicCloudConfig(supabaseUrl, supabaseAnonKey)) return null;
  try { return createClient(supabaseUrl, supabaseAnonKey, { auth: {
    storageKey: 'hypertrophy-navigator-auth-v1', detectSessionInUrl: false,
    persistSession: true, autoRefreshToken: true,
  } }); }
  catch { return null; }
}
export const supabase = cloudClientForApp(configuredClient);
export const cloudProjectOrigin = supabase ? new URL(supabaseUrl).origin : '';
