import { useState } from 'react';
import { requireCloudOwner } from '../db/queries/cloudAccess';
export function NutritionWorkConnections() {
  const [clients,setClients]=useState<{clientId:string;resource:string;enabled:boolean}[]>([]),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  async function load(){setBusy(true);try{const {client}=await requireCloudOwner();const r=await client.rpc('hypertrophy_nutrition_clients');if(r.error||!Array.isArray(r.data))throw new Error();setClients(r.data);setMessage('接続一覧を取得しました。');}catch{setMessage('本人ログインと栄養連携SQLを確認してください。');}finally{setBusy(false);}}
  return <details><summary>Workのアクセス許可を管理</summary><button className="btn" disabled={busy} onClick={()=>void load()}>許可した接続を表示</button>{clients.map(c=><div key={c.clientId}>
    <p>栄養用の接続 · {c.enabled?'有効':'停止済み'}</p><button className="btn" disabled={busy||!c.enabled} onClick={()=>{
      setBusy(true);void(async()=>{try{const {client}=await requireCloudOwner();const r=await client.rpc('hypertrophy_nutrition_client',{p_client_id:c.clientId,p_resource:c.resource,p_enabled:false});if(r.error)throw new Error();await load();}catch{setMessage('停止できませんでした。接続を確認してください。');}finally{setBusy(false);}})();
    }}>この接続の読み書きを停止</button></div>)}<p role="status">{message}</p></details>;
}
