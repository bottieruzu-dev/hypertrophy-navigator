declare module 'npm:@supabase/supabase-js@2.117.2' { export * from '@supabase/supabase-js'; }
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
