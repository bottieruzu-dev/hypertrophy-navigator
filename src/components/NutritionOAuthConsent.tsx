import { useState } from 'react';
import { supabase, cloudProjectOrigin } from '../lib/supabase';
import { inspectCloudOwner } from '../db/queries/cloudAccess';
import { safeChatGPTRedirect as safeRedirect, type ConsentDetails } from '../lib/oauthConsent';

export function NutritionOAuthConsent({authorizationId,details,userId}:{authorizationId:string;details:ConsentDetails;userId:string}) {
  const [message,setMessage]=useState('接続するアプリと権限を確認してください。');
  const [busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false);
  async function approve() {
    const client=supabase;if(!client||!details||!confirmed)return;
    setBusy(true);
    try{
      if(await inspectCloudOwner() !== userId || details.user.id !== userId)throw new Error('本人のアカウントで接続内容を取得し直してください。');
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

    {details&&<><p>接続するアプリ：{details.client.name}</p><p>要求する権限：{details.scope}</p>
      <label className="check-line"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>自分が作成した栄養用のChatGPT接続であることを確認しました</label>
      <button className="btn primary" disabled={busy||!confirmed} onClick={()=>void approve()}>栄養の読み取りと下書き保存を許可</button></>}

    <p role="status">{busy?'確認中…':message}</p><p>許可しない場合は、この画面を閉じてChatGPT側で接続を取り消してください。</p>
  </section></section>;
}
