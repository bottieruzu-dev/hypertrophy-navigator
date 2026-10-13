import { db } from '../db';
import { supabase, cloudProjectOrigin } from '../../lib/supabase';
import { bindingMatches, verifiedOwner, CLOUD_UNAVAILABLE_MESSAGE } from '../../lib/cloudPolicy';

export const CLOUD_BINDING_KEY = 'cloud:owner-binding:v1';
export async function inspectCloudOwner(): Promise<string> {
  const client = supabase;
  if (!client) throw new Error(CLOUD_UNAVAILABLE_MESSAGE);
  return verifiedOwner(async () => {
    const result = await client.auth.getUser();
    return result.error ? undefined : result.data.user?.id;
  }, async () => {
    const result = await client.rpc('hypertrophy_cloud_access');
    return !result.error && result.data === true;
  });
}
export async function requireCloudOwner() {
  const userId = await inspectCloudOwner();
  const binding = (await db.settings.get(CLOUD_BINDING_KEY))?.value;
  if (!bindingMatches(binding, userId, cloudProjectOrigin)) throw new Error(CLOUD_UNAVAILABLE_MESSAGE);
  return { client: supabase!, userId };
}
export async function bindLocalRecords(): Promise<void> {
  const userId = await inspectCloudOwner();
  await db.transaction('rw', db.settings, async () => {
    const existing = (await db.settings.get(CLOUD_BINDING_KEY))?.value;
    if (existing && !bindingMatches(existing, userId, cloudProjectOrigin)) {
      throw new Error('この端末は別のアカウント・プロジェクトに登録済みです。記録の混在を防ぐため接続できません。');
    }
    await db.settings.put({ key: CLOUD_BINDING_KEY, value: { userId, projectOrigin: cloudProjectOrigin } });
  });
}
