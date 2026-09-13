import type { Food } from '../types';

export const FOODS: Food[] = [
  // --- 業務スーパー 冷凍野菜（冷凍時100g状態での実測栄養価換算） ---
  { id: 1,  name: '冷凍白菜 (業スー)',          unitLabel: '100g(冷凍)', unitG: 100, kcal: 13,  p: 0.8,  f: 0.1, c: 2.8,  tag: 'veg',     note: '冷凍時計量・水分込み' },
  { id: 2,  name: '冷凍揚げなす (業スー)',      unitLabel: '100g(冷凍)', unitG: 100, kcal: 160, p: 1.1,  f: 13.5,c: 7.0,  tag: 'veg',     note: '油調済み・冷凍時計量' },
  { id: 3,  name: '冷凍ほうれん草 (業スー)',    unitLabel: '100g(冷凍)', unitG: 100, kcal: 20,  p: 2.2,  f: 0.4, c: 3.1,  tag: 'veg',     note: 'カット済み・冷凍時計量' },
  { id: 4,  name: '冷凍刻みタマネギ (業スー)',  unitLabel: '100g(冷凍)', unitG: 100, kcal: 30,  p: 1.0,  f: 0.1, c: 7.2,  tag: 'veg',     note: 'みじん切り・冷凍時計量' },
  { id: 5,  name: '冷凍ブロッコリー (業スー)',  unitLabel: '100g(冷凍)', unitG: 100, kcal: 27,  p: 3.5,  f: 0.4, c: 4.5,  tag: 'veg',     note: '小房・冷凍時計量' },
  { id: 6,  name: '冷凍小松菜 (業スー)',        unitLabel: '100g(冷凍)', unitG: 100, kcal: 14,  p: 1.5,  f: 0.2, c: 2.4,  tag: 'veg',     note: 'カット済み・冷凍時計量' },

  // --- 肉・卵・プロテイン ---
  { id: 7,  name: '全卵 (生/ゆで)',             unitLabel: '1個(M)',    unitG: 50,  kcal: 74,  p: 6.2,  f: 5.2, c: 0.2,  tag: 'protein', note: 'Mサイズ1個（約50g）' },
  { id: 8,  name: '豚バラ肉 (ロピア)',          unitLabel: '100g(生)',  unitG: 100, kcal: 386, p: 14.2, f: 35.0,c: 0.1,  tag: 'protein', note: '生肉の重量で計算' },
  { id: 9,  name: '牛豚ひき肉 (ロピア)',        unitLabel: '100g(生)',  unitG: 100, kcal: 250, p: 17.0, f: 18.0,c: 0.5,  tag: 'protein', note: '標準合い挽き肉' },
  { id: 10, name: 'マイプロテイン (Impactホエイ)', unitLabel: '1食(30g)', unitG: 30,  kcal: 114, p: 22.0, f: 1.8, c: 1.8,  tag: 'protein', note: '付属スプーン1杯' },

  // --- 軽食・フルーツ・炭水化物 ---
  { id: 11, name: 'ドライデーツ',               unitLabel: '3個(約30g)', unitG: 30,  kcal: 80,  p: 0.7,  f: 0.1, c: 21.0, tag: 'carb',    note: '手軽な急速糖分補給' },
  { id: 12, name: '冷凍たこ焼き',              unitLabel: '5個(冷凍100g)', unitG: 100, kcal: 150, p: 5.2, f: 5.0, c: 21.0, tag: 'carb',    note: '冷凍時計量（5個分）' },
  { id: 13, name: 'プレーンヨーグルト',        unitLabel: '100g',      unitG: 100, kcal: 62,  p: 3.6,  f: 3.0, c: 4.9,  tag: 'protein', note: '全脂無糖タイプ' },
  { id: 14, name: '冷凍ブルーベリー(ミックス)', unitLabel: '100g(冷凍)', unitG: 100, kcal: 50,  p: 0.8,  f: 0.3, c: 12.0, tag: 'carb',    note: '冷凍時計量・抗酸化' },
  { id: 15, name: 'パックご飯 (白米)',         unitLabel: '1パック(200g)', unitG: 200, kcal: 290, p: 5.0, f: 0.8, c: 66.0, tag: 'carb',    note: '標準200g1パック' },
];