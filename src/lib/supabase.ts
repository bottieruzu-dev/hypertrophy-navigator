import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Invalid or missing configuration must not prevent local gym logging.
function configuredClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  try { return createClient(supabaseUrl, supabaseAnonKey); }
  catch { return null; }
}
export const supabase = configuredClient();
