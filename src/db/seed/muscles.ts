import type { Muscle } from '../types';

export const MUSCLES: Muscle[] = [
  { code: 'delt_lateral', nameJa: '三角筋中部',        weeklySetsMin: 14, weeklySetsMax: 20, priorityRank: 1, tag: 'priority',  note: '肩幅の主役' },
  { code: 'biceps_long',  nameJa: '上腕二頭筋 長頭',   weeklySetsMin: 7,  weeklySetsMax: 10, priorityRank: 1, tag: 'priority',  note: '腕の高さ' },
  { code: 'biceps_short', nameJa: '上腕二頭筋 短頭',   weeklySetsMin: 7,  weeklySetsMax: 10, priorityRank: 1, tag: 'priority',  note: '腕の太さ' },
  { code: 'abs_rectus',   nameJa: '腹直筋',            weeklySetsMin: 8,  weeklySetsMax: 12, priorityRank: 2, tag: 'priority',  note: 'カット強調' },
  { code: 'lat',          nameJa: '広背筋',            weeklySetsMin: 10, weeklySetsMax: 14, priorityRank: 2, tag: 'neutral',   note: 'V字の土台' },
  { code: 'delt_rear',    nameJa: '三角筋後部',        weeklySetsMin: 6,  weeklySetsMax: 8,  priorityRank: 3, tag: 'neutral' },
  { code: 'traps_mid',    nameJa: '僧帽筋中部・菱形筋', weeklySetsMin: 4,  weeklySetsMax: 6,  priorityRank: 3, tag: 'neutral' },
  { code: 'chest_upper',  nameJa: '大胸筋上部',        weeklySetsMin: 5,  weeklySetsMax: 9,  priorityRank: 3, tag: 'neutral',   note: 'F2-B: 下限6→5' },
  { code: 'triceps',      nameJa: '上腕三頭筋',        weeklySetsMin: 5,  weeklySetsMax: 9,  priorityRank: 3, tag: 'neutral',   note: 'F2-B: 下限6→5' },
  { code: 'brachialis',   nameJa: '上腕筋・前腕',      weeklySetsMin: 3,  weeklySetsMax: 5,  priorityRank: 4, tag: 'neutral' },
  { code: 'hams',         nameJa: 'ハムストリングス',   weeklySetsMin: 5,  weeklySetsMax: 7,  priorityRank: 4, tag: 'neutral' },
  { code: 'glutes',       nameJa: '臀筋',              weeklySetsMin: 4,  weeklySetsMax: 6,  priorityRank: 4, tag: 'neutral',   note: 'ウエスト無影響' },
  { code: 'erector',      nameJa: '脊柱起立筋',        weeklySetsMin: 3,  weeklySetsMax: 4,  priorityRank: 5, tag: 'neutral',   note: '傷害予防' },
  { code: 'abductor',     nameJa: '中臀筋・外転筋',    weeklySetsMin: 0,  weeklySetsMax: 3,  priorityRank: 5, tag: 'optional' },
  { code: 'delt_front',   nameJa: '三角筋前部',        weeklySetsMin: 0,  weeklySetsMax: 8,  priorityRank: 5, tag: 'suppress',  note: 'プレス副次で充足' },
  { code: 'quads',        nameJa: '大腿四頭筋',        weeklySetsMin: 4,  weeklySetsMax: 6,  priorityRank: 5, tag: 'suppress',  note: '過剰バルク回避' },
  { code: 'chest_mid',    nameJa: '大胸筋中部',        weeklySetsMin: 3,  weeklySetsMax: 4,  priorityRank: 5, tag: 'suppress',  note: '維持のみ' },
  { code: 'traps_upper',  nameJa: '僧帽筋上部',        weeklySetsMin: 0,  weeklySetsMax: 6,  priorityRank: 6, tag: 'suppress',  note: '肩幅の見え方を相殺' },
  { code: 'chest_lower',  nameJa: '大胸筋下部',        weeklySetsMin: 0,  weeklySetsMax: 2,  priorityRank: 6, tag: 'suppress',  note: 'シルエット悪化要因' },
  { code: 'calves',       nameJa: '下腿三頭筋',        weeklySetsMin: 0,  weeklySetsMax: 4,  priorityRank: 6, tag: 'optional',  note: '予算余剰時のみ' },
  { code: 'obliques',     nameJa: '腹斜筋',            weeklySetsMin: 0,  weeklySetsMax: 0,  priorityRank: 7, tag: 'forbidden', note: '重量種目禁止' },
];

export const TOTAL_MIN_SETS = MUSCLES.reduce((s, m) => s + m.weeklySetsMin, 0);