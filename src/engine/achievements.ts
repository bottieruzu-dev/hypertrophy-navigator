import confetti from 'canvas-confetti';

export type IconName =
  | 'Egg' | 'Milk' | 'Dumbbell' | 'Flame' | 'UtensilsCrossed'
  | 'Wand2' | 'Footprints' | 'Bot' | 'Zap' | 'Crown' | 'Award';

export interface LevelTitle {
  minLevel: number;
  title: string;
  iconName: IconName;
}

/** 洗練されたベクターアイコン指定付きのレベル別称号マスタ */
export const HUMOR_TITLES: LevelTitle[] = [
  { minLevel: 1,  title: '筋肉の生まれたてひよこ', iconName: 'Egg' },
  { minLevel: 2,  title: 'プロテインビギナー',     iconName: 'Milk' },
  { minLevel: 3,  title: 'ダンベルと初対面',       iconName: 'Dumbbell' },
  { minLevel: 5,  title: '筋肉痛を愛し始めた者',   iconName: 'Flame' },
  { minLevel: 8,  title: '鶏むね肉の調理マスター', iconName: 'UtensilsCrossed' },
  { minLevel: 10, title: 'プロテインシェイカーの魔術師', iconName: 'Wand2' },
  { minLevel: 15, title: '階段を下りるのが恐怖の漢', iconName: 'Footprints' },
  { minLevel: 20, title: 'プロテイン錬金術師',     iconName: 'Wand2' },
  { minLevel: 25, title: 'ジムの地縛霊',           iconName: 'Award' },
  { minLevel: 30, title: '人間ベンチプレス機',     iconName: 'Bot' },
  { minLevel: 40, title: '重力の法則を無視する者', iconName: 'Zap' },
  { minLevel: 50, title: '歩く人間兵器',           iconName: 'Flame' },
  { minLevel: 75, title: '超サイヤ筋',             iconName: 'Zap' },
  { minLevel: 99, title: '筋神 (Hypertrophy God)', iconName: 'Crown' },
];

export interface UserLevelInfo {
  level: number;
  title: string;
  iconName: IconName;
  totalExp: number;
  currentLevelExp: number;
  nextLevelExp: number;
  progressPct: number;
}

/** 筋トレ・Week0・体組成・栄養すべての実績から総合EXPとレベルを計算 */
export function calculateUserLevel(params: {
  totalSets: number;         // 本番・Week0のセット数 (1セット = 50 EXP)
  totalVolumeKg: number;     // 挙上重量 (10kg = 1 EXP)
  bodyMetricDays: number;    // 体組成の記録日数 (1日 = 100 EXP)
  totalProteinCheckedG: number; // 摂取タンパク質 (1g = 2 EXP)
}): UserLevelInfo {
  const { totalSets, totalVolumeKg, bodyMetricDays, totalProteinCheckedG } = params;

  const totalExp = Math.floor(
    totalSets * 50 +
    totalVolumeKg / 10 +
    bodyMetricDays * 100 +
    totalProteinCheckedG * 2
  );

  let level = 1;
  let expAccumulated = 0;

  while (level < 99) {
    const requiredForNext = Math.floor(Math.pow(level, 1.7) * 60);
    if (totalExp < expAccumulated + requiredForNext) {
      const currentLevelExp = totalExp - expAccumulated;
      const progressPct = Math.min(100, Math.floor((currentLevelExp / requiredForNext) * 100));
      
      const titleObj = [...HUMOR_TITLES].reverse().find((t) => level >= t.minLevel) ?? HUMOR_TITLES[0];

      return {
        level,
        title: titleObj.title,
        iconName: titleObj.iconName,
        totalExp,
        currentLevelExp,
        nextLevelExp: requiredForNext,
        progressPct,
      };
    }
    expAccumulated += requiredForNext;
    level++;
  }

  return {
    level: 99,
    title: '筋神 (Hypertrophy God)',
    iconName: 'Crown',
    totalExp,
    currentLevelExp: 0,
    nextLevelExp: 0,
    progressPct: 100,
  };
}

export interface Achievement {
  level: number;
  title: string;
  requiredVolumeKg: number;
  message: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { level: 1, title: '鉄の目覚め', requiredVolumeKg: 100, message: '筋肥大への第一歩を踏み出しました！' },
  { level: 2, title: '重力の挑戦者', requiredVolumeKg: 1000, message: '累計1トン突破！体に変化が表れ始めています！' },
  { level: 3, title: '鋼鉄の肉体', requiredVolumeKg: 5000, message: '累計5トン到達！ジムの常連の仲間入りです！' },
  { level: 4, title: '肥大の支配者', requiredVolumeKg: 10000, message: '累計10トン突破！圧倒的なバルクを手に入れました！' },
  { level: 5, title: '筋神 (Hypertrophy God)', requiredVolumeKg: 50000, message: '累計50トン到達！誰もあなたを止められません！' },
];

export function fireNeonConfetti() {
  const count = 200;
  const defaults = { origin: { y: 0.7 } };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio)
    });
  }

  fire(0.25, { spread: 26, startVelocity: 55, colors: ['#00f2fe', '#4facfe'] });
  fire(0.2, { spread: 60, colors: ['#b537ff', '#ffffff'] });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ['#00f2fe', '#b537ff', '#00e676'] });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, colors: ['#ffffff', '#00f2fe'] });
  fire(0.1, { spread: 120, startVelocity: 45, colors: ['#b537ff', '#4facfe'] });
}