import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlinePlugin } from './scripts/offline-plugin.ts';

export default defineConfig(({ mode }) => ({
  plugins: [react(), offlinePlugin()],
  // Verification never loads secret files or creates a configured cloud client.
  envDir: mode === 'test' || process.env.CODEX_SAFE_BUILD === '1' ? false : undefined,
  resolve: { preserveSymlinks: mode === 'test' || process.env.CODEX_SAFE_BUILD === '1' },
  define: mode === 'test' || process.env.CODEX_SAFE_BUILD === '1' ? {
    'import.meta.env.VITE_SUPABASE_URL': '""',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
  } : undefined,
  base: '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
}));
