import confetti from 'canvas-confetti';

export interface Achievement {
  level: number;
  title: string;
  requiredVolumeKg: number;
  message: string;
}

/** 累計ボリュームに応じた称号リスト */
export const ACHIEVEMENTS: Achievement[] = [
  { level: 1, title: '鉄の目覚め', requiredVolumeKg: 100, message: '筋肥大への第一歩を踏み出しました！' },
  { level: 2, title: '重力の挑戦者', requiredVolumeKg: 1000, message: '累計1トン突破！体に変化が表れ始めています！' },
  { level: 3, title: '鋼鉄の肉体', requiredVolumeKg: 5000, message: '累計5トン到達！ジムの常連の仲間入りです！' },
  { level: 4, title: '肥大の支配者', requiredVolumeKg: 10000, message: '累計10トン突破！圧倒的なバルクを手に入れました！' },
  { level: 5, title: '筋神 (Hypertrophy God)', requiredVolumeKg: 50000, message: '累計50トン到達！誰もあなたを止められません！' },
];

/** ネオンカラーのクラッカー・スパークを画面全体に炸裂させる */
export function fireNeonConfetti() {
  // シアンブルーとパープルのネオン粒子
  const count = 200;
  const defaults = {
    origin: { y: 0.7 }
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio)
    });
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    colors: ['#00f2fe', '#4facfe']
  });
  fire(0.2, {
    spread: 60,
    colors: ['#b537ff', '#ffffff']
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    colors: ['#00f2fe', '#b537ff', '#00e676']
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    colors: ['#ffffff', '#00f2fe']
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
    colors: ['#b537ff', '#4facfe']
  });
}