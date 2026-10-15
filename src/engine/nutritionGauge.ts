import type { Nutrient } from './nutrition';
export type GaugeTone = 'low' | 'met' | 'above' | 'high' | 'unknown';
export function nutritionGauge(n: Nutrient, a: { known:number; missing:number; total:number }, target:number) {
  const hasKnown = a.total > a.missing;
  const ratio = hasKnown && target > 0 ? a.known / target : null;
  let tone: GaugeTone = 'unknown', label = a.total ? '不明' : '未記録';
  if (ratio !== null) {
    if (n.kind === '上限方向' && ratio > 1) { tone='high';label=a.missing?'既知分で超過':'目安を超過'; }
    else if (a.missing) label='一部不明';
    else if (n.kind === '上限方向') {tone='met';label='範囲内';}
    else if (ratio < 1) {tone='low';label='目安まで';}
    else if (n.kind === '目安' && ratio > 1) {tone='above';label='目標以上';}
    else {tone='met';label='目安に到達';}
  }
  return {tone,label,ratio,hasKnown,width:ratio===null?0:Math.min(100,Math.max(0,ratio/1.5*100))};
}
