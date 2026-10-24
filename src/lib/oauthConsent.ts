export interface ConsentDetails {
  authorization_id: string;
  client: { id: string; name: string };
  user: { id: string };
  scope: string;
  redirect_uri: string;
}
export interface ConsentConfig {
  nutritionClientId: string;
  listeningClientId: string;
  listeningConsentUrl: string;
}

export function safeChatGPTRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['chatgpt.com', 'chat.openai.com'].includes(url.hostname)
      && !url.username && !url.password && !url.port && !url.hash;
  } catch { return false; }
}

export function consentTarget(details: ConsentDetails, authorizationId: string, userId: string, config: ConsentConfig) {
  if (!userId || details.user.id !== userId || details.authorization_id !== authorizationId) {
    throw new Error('本人または接続IDを確認できません。');
  }
  if (config.nutritionClientId && config.nutritionClientId === config.listeningClientId) {
    throw new Error('用途ごとに異なるクライアントIDを設定してください。');
  }
  if (!safeChatGPTRedirect(details.redirect_uri)) throw new Error('ChatGPT以外の接続先は承認できません。');
  const scopes = details.scope.trim().split(/\s+/);
  if (config.listeningClientId && details.client.id === config.listeningClientId) {
    if (scopes.length !== 1 || scopes[0] !== 'openid') throw new Error('問題作成の要求範囲が一致しません。');
    let url: URL;
    try { url = new URL(config.listeningConsentUrl); }
    catch { throw new Error('Listening Labの同意画面が未設定です。'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) {
      throw new Error('Listening Labの同意画面には、クエリやフラグメントのないHTTPS URLを設定してください。');
    }
    url.searchParams.set('authorization_id', authorizationId);
    return { kind: 'listening' as const, url: url.href };
  }
  if (config.nutritionClientId && details.client.id === config.nutritionClientId) {
    if (scopes.some(s => !['openid', 'profile', 'email', 'offline_access'].includes(s))) {
      throw new Error('対応していない権限が要求されています。');
    }
    return { kind: 'nutrition' as const };
  }
  throw new Error('許可対象の接続ではありません。専用クライアントIDの設定を確認してください。');
}

// A redirect-only response contains no client ID. Never guess its purpose from a callback or query string.
export async function loadConsent(
  authorizationId: string,
  config: ConsentConfig,
  getUser: () => Promise<string | undefined>,
  getDetails: () => Promise<ConsentDetails | { redirect_url: string }>,
) {
  const userId = await getUser();
  if (!userId) throw new Error('本人のアカウントにログインしてください。');
  const details = await getDetails();
  if (!('authorization_id' in details)) {
    throw new Error('承認済みの応答には接続IDがないため転送できません。ChatGPTで接続を取り消してから接続し直してください。');
  }
  return { details, userId, target: consentTarget(details, authorizationId, userId, config) };
}
