import { aggregateNutrition, NUTRIENTS, nutrientDifference, type MealRecord, type TargetSnapshot } from '../engine/nutrition';
export function NutrientTable({ records, targets, group }: {
    records: MealRecord[];
    targets: TargetSnapshot;
    group?: string;
}) {
    const totals = aggregateNutrition(records);
    return <div className="nutrient-scroll"><table className="nutrient-table"><thead><tr><th>栄養素</th><th>入力済み食材の集計</th><th>一日の目安</th><th>差・状態</th></tr></thead><tbody>{NUTRIENTS.filter(n => !group || n.group === group).map(n => { const a = totals[n.key]; return <tr key={n.key}><th>{n.name}<small>{n.kind}</small></th><td>{!a.total ? '—' : a.missing === a.total ? '不明' : `${a.missing ? '既知分 ' : ''}${a.known} ${n.unit}`} {!!a.missing && a.missing < a.total && <small>{a.missing}品不明</small>}</td><td>{n.kind === '上限方向' ? (n.key === 'salt_g' ? '＜' : '≤') : n.kind === '目標量' ? '≥' : ''}{targets.values[n.key]} {n.unit}</td><td>{nutrientDifference(n, a, targets.values[n.key])}</td></tr>; })}</tbody></table></div>;
}
