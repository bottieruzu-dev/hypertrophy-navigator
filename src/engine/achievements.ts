import confetti from 'canvas-confetti';

export interface LevelTitle {
  minLevel: number;
  title: string;
}

/** ユーモアあふれるレベル別称号リスト */
export const HUMOR_TITLES: LevelTitle[] = [
  { minLevel: 1, title: '筋肉の生まれたてひよこ 🐣' },
  { minLevel: 2, title: 'プロテインビギナー 🥛' },
  { minLevel: 3, title: 'ダンベルと初対面 🏋️' },
  { minLevel: 5, title: '筋肉痛を愛し始めた者 💥' },
  { minLevel: 8, title: '鶏むね肉の調理マスター 🍗' },
  { minLevel: 10, title: 'プロテインシェイカーの魔術師 🧙‍♂️' },
  { minLevel: 15, title: '階段を下りるのが恐怖の漢 😰' },
  { minLevel: 20, title: 'プロテイン錬金術師 ⚗️' },
  { minLevel: 25, title: 'ジムの地縛霊 👻' },
  { minLevel: 30, title: '人間ベンチプレス機 🤖' },
  { minLevel: 40, title: '重力の法則を無視する者 🌌' },
  { minLevel: 50, title: '歩く人間兵器 💣' },
  { minLevel: 75, title: '超サイヤ筋 ⚡' },
  { minLevel: 99, title: '筋神 (Hypertrophy God) 👑' },
];

export interface UserLevelInfo {
  level: number;
  title: string;
  totalExp: number;
  currentLevelExp: number;
  nextLevelExp: number;
  progressPct: number;
}

/** 累計セット数とボリュームからレベル・称号・EXPを即座に計算 */
export function calculateUserLevel(totalSets: number, totalVolumeKg: number): UserLevelInfo {
  // 1セット = 50 EXP, 10kg挙上 = 1 EXP
  const totalExp = Math.floor(totalSets * 50 + totalVolumeKg / 10);

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
    title: '筋神 (Hypertrophy God) 👑',
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