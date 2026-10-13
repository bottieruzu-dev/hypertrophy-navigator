import { NUTRIENTS, nutritionAverages, type MealRecord } from '../engine/nutrition';
export function NutritionAverages({records,date}:{records:MealRecord[];date:string}) {
  const stats=nutritionAverages(records,date);
  return <details><summary>直近7日間の記録日平均</summary><p className="sub">記録がある{stats.recordedDays}日を平均。未記録{stats.unrecordedDays}日と、不明な栄養値は0として扱いません。未記録の食事がある場合、一日の全摂取量ではありません。</p><div className="nutrient-scroll"><table className="nutrient-table"><thead><tr><th>栄養素</th><th>既知分の記録日平均</th><th>保存時の目標平均</th><th>不明</th></tr></thead><tbody>{NUTRIENTS.map(n=>{const a=stats.values[n.key];return <tr key={n.key}><th>{n.name}</th><td>{a.knownAverage===null||a.missing===a.total?'—':`${a.knownAverage} ${n.unit}`}</td><td>{a.targetAverage===null?'—':`${a.targetAverage} ${n.unit}`}</td><td>{a.missing}品</td></tr>;})}</tbody></table></div></details>;
}
