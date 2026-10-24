import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadConsent } from '../lib/oauthConsent';
import { NutritionOAuthConsent } from './NutritionOAuthConsent';

export function OAuthConsent({ authorizationId }: { authorizationId: string }) {
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadConsent>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('上のクラウド設定で本人のアカウントにログインしてから、接続内容を確認してください。Listening Labの接続では、この端末の所有者登録は不要です。');
  const generation = useRef(0);
  useEffect(() => {
    const invalidate = () => { generation.current++; };
    const listener = supabase?.auth.onAuthStateChange(() => { invalidate(); setLoaded(null); });
    return () => { invalidate(); listener?.data.subscription.unsubscribe(); };
  }, [authorizationId]);
  async function load() {
    const current = ++generation.current;
    setLoaded(null); setBusy(true);
    try {
      const client = supabase;
      if (!client) throw new Error('公開用の接続設定がありません。');
      const result = await loadConsent(authorizationId, {
        nutritionClientId: import.meta.env.VITE_NUTRITION_OAUTH_CLIENT_ID || '',
        listeningClientId: import.meta.env.VITE_LISTENING_QUIZ_CLIENT_ID || '',
        listeningConsentUrl: import.meta.env.VITE_LISTENING_QUIZ_CONSENT_URL || '',
      }, async () => {
        const result = await client.auth.getUser();
        return result.error ? undefined : result.data.user?.id;
      }, async () => {
        const result = await client.auth.oauth.getAuthorizationDetails(authorizationId);
        if (result.error || !result.data) throw new Error('接続内容を取得できませんでした。本人ログインとOAuth設定を確認してください。');
        return result.data;
      });
      if (current === generation.current) { setLoaded(result); setMessage('接続先を確認してください。'); }
    } catch (error) {
      if (current === generation.current) setMessage(error instanceof Error ? error.message : '接続先を確認できません。');
    } finally { setBusy(false); }
  }
  if (loaded?.target.kind === 'nutrition') return <NutritionOAuthConsent authorizationId={authorizationId} details={loaded.details} userId={loaded.userId} />;
  return <section className="page"><section className="card"><h1>連携先の確認</h1>
    <button className="btn" disabled={busy} onClick={() => void load()}>本人確認・接続内容を取得</button>
    {loaded?.target.kind === 'listening' && <>
      <h2>Listening Labの問題作成</h2><p>Listening Labでログインし、接続内容と権限を確認して許可してください。</p>
      <a className="btn primary" href={loaded.target.url} referrerPolicy="no-referrer">Listening Labで接続を確認</a>
    </>}
    <p role="status">{busy ? '確認中…' : message}</p>
  </section></section>;
}
