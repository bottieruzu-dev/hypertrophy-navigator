import { useState } from 'react';
import { supabase, cloudProjectOrigin } from '../lib/supabase';
import { inspectCloudOwner } from '../db/queries/cloudAccess';

interface Details { client:{id:string;name:string};scope:string;redirect_uri:string }
const safeRedirect=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&['chatgpt.com','chat.openai.com'].includes(u.hostname)&&!u.username&&!u.password;}catch{return false;}};
export function NutritionOAuthConsent({authorizationId}:{authorizationId:string}) {
  const [details,setDetails]=useState<Details|null>(null),[message,setMessage]=useState('上のクラウド設定で本人のアカウントにログインしてから、接続内容を確認してください。');
  const [redirect,setRedirect]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false);
  async function load() {
    const client=supabase;if(!client)return;
    setBusy(true);
    try {
      await inspectCloudOwner();
      const result=await client.auth.oauth.getAuthorizationDetails(authorizationId);
      if(result.error||!result.data)throw new Error('取得できませんでした。本人ログインとOAuth Serverの設定を確認してください。');
      if('authorization_id' in result.data) {
        if(!safeRedirect(result.data.redirect_uri))throw new Error('ChatGPT以外の接続先は承認できません。');
        if(result.data.scope.split(' ').some(s=>!['openid','profile','email','offline_access'].includes(s)))throw new Error('対応していない権限が要求されています。');
        setDetails(result.data);setConfirmed(false);setMessage('接続するアプリと権限を確認してください。');
      } else {
        if(!safeRedirect(result.data.redirect_url))throw new Error('接続先を確認できません。');
        setRedirect(result.data.redirect_url);setMessage('承認済みの接続です。ChatGPTへ戻れます。');
      }
    } catch(e){setMessage(e instanceof Error?e.message:'接続内容を取得できませんでした。');}
    finally{setBusy(false);}
  }
  async function approve() {
    const client=supabase;if(!client||!details)return;
    setBusy(true);
    try{
      await inspectCloudOwner();
      const registered=await client.rpc('hypertrophy_nutrition_client',{p_client_id:details.client.id,p_resource:cloudProjectOrigin+'/functions/v1/nutrition-work-mcp',p_enabled:true});
      if(registered.error)throw new Error('許可先の登録ができませんでした。栄養連携SQLを確認してください。');
      const result=await client.auth.oauth.approveAuthorization(authorizationId,{skipBrowserRedirect:true});
      if(result.error||!result.data||!safeRedirect(result.data.redirect_url))throw new Error('承認を完了できませんでした。');
      const expected=new URL(details.redirect_uri),actual=new URL(result.data.redirect_url);
      if(expected.origin!==actual.origin||expected.pathname!==actual.pathname)throw new Error('接続先が一致しません。');
      window.location.assign(result.data.redirect_url);
    }catch(e){setMessage(e instanceof Error?e.message:'承認できませんでした。');}finally{setBusy(false);}
  }
  return <section className="page nutrition-page"><section className="card"><h1>栄養連携のアクセス確認</h1>
    <p>許可したWorkは、計算待ちの食材・量を読み、栄養の下書きを保存できます。栄養プロフィール・体組成・筋トレ履歴の読み取りや、食事の確定は許可しません。</p>
    <p className="sub">同じSupabaseプロジェクトの別アプリが独自に与える権限は、この画面の制限対象ではありません。連携には栄養専用のOAuthクライアントを使います。</p>
    <button className="btn" disabled={busy} onClick={()=>void load()}>本人確認・接続内容を取得</button>
    {details&&<><p>接続するアプリ：{details.client.name}</p><p>要求する権限：{details.scope}</p>
      <label className="check-line"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>自分が作成した栄養用のChatGPT接続であることを確認しました</label>
      <button className="btn primary" disabled={busy||!confirmed} onClick={()=>void approve()}>栄養の読み取りと下書き保存を許可</button></>}
    {redirect&&<a className="btn" href={redirect}>ChatGPTへ戻る</a>}
    <p role="status">{busy?'確認中…':message}</p><p>許可しない場合は、この画面を閉じてChatGPT側で接続を取り消してください。</p>
  </section></section>;
}
