// Each data path must also pass server-verified ownership and local account binding.
export const CLOUD_SYNC_PAUSED_FOR_SECURITY = false;
export const CLOUD_UNAVAILABLE_MESSAGE = 'クラウドの設定・ログイン・所有者確認が必要です。端末内の記録は保持しています。';

export function cloudClientForApp<T>(initialize: () => T): T | null {
  if (CLOUD_SYNC_PAUSED_FOR_SECURITY) return null;
  return initialize();
}

export interface CloudBinding { userId: string; projectOrigin: string }
export function bindingMatches(binding: unknown, userId: string, projectOrigin: string): boolean {
  if (!binding || typeof binding !== 'object') return false;
  const b = binding as Partial<CloudBinding>;
  return b.userId === userId && b.projectOrigin === projectOrigin;
}

/** Browser configuration must never contain a secret/service-role key. */
export function publicCloudConfig(url: string, key: string): boolean {
  try {
    const u = new URL(url);
    if (u.username || u.password || u.search || u.hash) return false;
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return false;
    if (key.startsWith('sb_publishable_')) return key.length > 20;
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'anon';
  } catch { return false; }
}

export async function verifiedOwner(
  verifyUser: () => Promise<string | undefined>,
  verifyAccess: () => Promise<boolean>,
): Promise<string> {
  const id = await verifyUser();
  if (!id || !await verifyAccess()) throw new Error(CLOUD_UNAVAILABLE_MESSAGE);
  return id;
}
