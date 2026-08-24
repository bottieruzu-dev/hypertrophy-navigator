import type { Food } from '../types';

export const FOODS: Food[] = [
  { id: 1,  name: '鶏むね肉(皮なし)',       unitLabel: '100g',  unitG: 100, kcal: 108, p: 22.3, f: 1.5,  c: 0.1,  tag: 'protein', note: '主力。冷凍作り置き可' },
  { id: 2,  name: 'ゆで卵',                 unitLabel: '1個',   unitG: 50,  kcal: 68,  p: 6.1,  f: 4.7,  c: 0.2,  tag: 'protein', note: '脂質確保も兼ねる' },
  { id: 3,  name: 'ホエイプロテイン',        unitLabel: '1杯',   unitG: 30,  kcal: 117, p: 24.0, f: 1.5,  c: 2.0,  tag: 'protein', note: '不足分の最終調整用' },
  { id: 4,  name: 'ギリシャヨーグルト(無脂肪)', unitLabel: '1個', unitG: 100, kcal: 59, p: 10.2, f: 0.2,  c: 3.9,  tag: 'protein', note: 'カゼイン。就寝前推奨' },
  { id: 5,  name: 'ツナ水煮缶',             unitLabel: '1缶',   unitG: 70,  kcal: 50,  p: 11.2, f: 0.5,  c: 0.1,  tag: 'protein', note: '調理不要' },
  { id: 6,  name: '絹豆腐',                 unitLabel: '1丁',   unitG: 300, kcal: 168, p: 15.9, f: 10.5, c: 5.1,  tag: 'protein' },
  { id: 7,  name: '鮭(生)',                 unitLabel: '1切',   unitG: 80,  kcal: 106, p: 17.8, f: 3.3,  c: 0.1,  tag: 'protein', note: '脂質の質が良い' },
  { id: 8,  name: '白米(炊飯)',             unitLabel: '150g',  unitG: 150, kcal: 234, p: 3.8,  f: 0.5,  c: 53.4, tag: 'carb',    note: '主力炭水化物' },
  { id: 9,  name: 'オートミール',            unitLabel: '40g',   unitG: 40,  kcal: 152, p: 5.5,  f: 2.8,  c: 27.6, tag: 'carb',    note: '朝食向き' },
  { id: 10, name: 'バナナ',                 unitLabel: '1本',   unitG: 100, kcal: 86,  p: 1.1,  f: 0.2,  c: 22.5, tag: 'carb',    note: 'トレ前' },
  { id: 11, name: 'さつまいも',             unitLabel: '150g',  unitG: 150, kcal: 197, p: 1.8,  f: 0.3,  c: 47.0, tag: 'carb' },
  { id: 12, name: 'アーモンド',             unitLabel: '20g',   unitG: 20,  kcal: 120, p: 3.9,  f: 10.9, c: 2.1,  tag: 'fat',     note: '脂質枠の確保' },
  { id: 13, name: 'オリーブオイル',         unitLabel: '大さじ1', unitG: 12, kcal: 111, p: 0,    f: 12.0, c: 0,    tag: 'fat',     note: '調理油' },
  { id: 14, name: '冷凍ブロッコリー',        unitLabel: '150g',  unitG: 150, kcal: 50,  p: 6.5,  f: 0.8,  c: 3.0,  tag: 'veg',     note: '現行食に追加想定' },
  { id: 15, name: '冷凍ほうれん草',          unitLabel: '150g',  unitG: 150, kcal: 30,  p: 3.3,  f: 0.6,  c: 0.5,  tag: 'veg' },
];