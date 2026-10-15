import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createNutritionHandler } from './handler.ts';

// Server-side public key only. Never use a service-role key for the worker.
const base = Deno.env.get('SUPABASE_URL')!;
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const resource = base + '/functions/v1/nutrition-work-mcp';
const publicClient = createClient(base, publicKey, {auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createNutritionHandler({
  issuer:base+'/auth/v1',resource,
  async verify(token) {
    const result = await publicClient.auth.getClaims(token);
    if (result.error || !result.data?.claims) throw new Error('Invalid token');
    const c=result.data.claims;
    return {subject:c.sub,issuer:c.iss,audience:c.aud,expires:c.exp,clientId:c.client_id as string,scope:c.scope as string};
  },
  async rpc(token,name,args) {
    const client=createClient(base,publicKey,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
    const result=await client.rpc(name,args);
    if (result.error) throw new Error('Nutrition operation denied');
    return result.data;
  },
}));
