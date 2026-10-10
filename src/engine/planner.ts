import type { DailyPlan, Exercise, ExerciseBaseline, Muscle, MuscleCode, MuscleCredit, PlannedExercise, SessionRecord, SetRecord, SplitType, WorkoutContext } from '../db/types';
import { daysBetween, shiftDate, todayInJapan } from './dates';
import { prescribeNextLoad } from './progression';
import { effectiveIncrement, roundToIncrement } from './units';

export const SPLIT_LABELS: Record<SplitType, string> = { upper_A: '上半身 A · 背中・肩・二頭筋', lower: '下半身 · 脚・お尻・体幹', upper_B: '上半身 B · 胸・肩・三頭筋' };
export const SPLIT_ORDER: SplitType[] = ['upper_A', 'lower', 'upper_B'];
// One alternative per slot: the calibration catalogue is not a day's workload.
export const WORKOUT_GROUPS: Record<SplitType, number[][]> = {
  upper_A: [[12, 13], [14, 15, 16], [1, 2, 3], [6, 7], [8], [9, 10], [25, 26]],
  lower: [[31, 32], [29, 30], [33], [34], [27, 25, 26]],
  upper_B: [[18, 19, 20], [37, 21], [2, 1, 3], [23, 24], [7, 6], [26, 25], [4, 5]],
};

export function validBaseline(b: ExerciseBaseline | undefined, ex: Exercise): b is ExerciseBaseline {
  return !!b && Number.isFinite(b.weightKg) && (ex.increment === 0 ? b.weightKg >= 0 : b.weightKg > 0)
    && Number.isInteger(b.reps) && b.reps > 0 && b.reps <= 100
    && Number.isFinite(b.rir) && b.rir >= 0 && b.rir <= 5 && Number.isFinite(b.calibratedAt) && b.calibratedAt > 0 && Number.isFinite(new Date(b.calibratedAt).getTime());
}

export function workingSets(sets: SetRecord[], end: string): SetRecord[] {
  return sets.filter(s => s.date <= end && !s.isWarmup && s.mode !== 'calibration'
    && Number.isFinite(s.actualWeight) && s.actualWeight >= 0 && Number.isInteger(s.actualReps) && s.actualReps > 0
    && Number.isFinite(s.actualRir) && s.actualRir >= 0 && s.actualRir <= 5);
}

export function weeklyCredits(sets: SetRecord[], credits: MuscleCredit[], date: string): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const set of workingSets(sets, date).filter(s => s.date >= shiftDate(date, -6))) {
    for (const c of credits.filter(c => c.exerciseId === set.exerciseId)) totals[c.muscle] = (totals[c.muscle] ?? 0) + c.credit;
  }
  return totals;
}

export interface PlannerInput {
  date: string; now: number; exercises: Exercise[]; baselines: ExerciseBaseline[];
  sets: SetRecord[]; sessions: SessionRecord[]; plans: DailyPlan[]; muscles: Muscle[]; credits: MuscleCredit[];
  context: WorkoutContext;
  ignoreSessionIdForRecovery?: number;
}

export function estimateMinutes(items: PlannedExercise[], exercises: Exercise[]): number {
  return Math.ceil(5 + items.reduce((sum, item) => {
    const ex = exercises.find(e => e.id === item.exerciseId);
    return sum + (ex?.type === 'compound' ? 3 : 1.5) + item.sets * 0.75 + Math.max(0, item.sets - 1) * item.restSec / 60;
  }, 0));
}

function previousPerformance(ex: Exercise, input: PlannerInput): SetRecord[] {
  const eligible = workingSets(input.sets, input.date).filter(s => s.exerciseId === ex.id && (ex.increment === 0 || s.actualWeight > 0));
  const managedIds = new Set(input.plans.map(p => p.sessionId));
  const completedIds = new Set(input.plans.filter(p => p.status === 'completed').map(p => p.sessionId));
  const baseline = input.baselines.find(b => b.exerciseId === ex.id);
  const baselineDate = baseline ? todayInJapan(new Date(baseline.calibratedAt)) : '';
  const usable = eligible.filter(s => {
    const plan = input.plans.find(p => p.sessionId === s.sessionId);
    const target = plan?.exercises.find(e => e.exerciseId === ex.id);
    const fullyDone = !plan || (!!target && !plan.skippedExerciseIds.includes(ex.id) && eligible.filter(r => r.sessionId === s.sessionId).length >= target.sets);
    return fullyDone && (!managedIds.has(s.sessionId) || completedIds.has(s.sessionId)) && s.date >= baselineDate
      && (!plan || !baseline || plan.createdAt >= baseline.calibratedAt);
  });
  usable.sort((a, b) => b.date.localeCompare(a.date) || b.sessionId - a.sessionId || b.setOrder - a.setOrder);
  if (!usable.length) return [];
  // Legacy session 1 spans dates. Never group by sessionId alone.
  return usable.filter(s => s.sessionId === usable[0].sessionId && (managedIds.has(s.sessionId) || s.date === usable[0].date));
}

export function buildDailyPlan(input: PlannerInput): Omit<DailyPlan, 'sessionId'> {
  const { date, now, context, exercises, baselines, credits, muscles } = input;
  const volume = weeklyCredits(input.sets, credits, date);
  const recentSets = workingSets(input.sets, date);
  const warnings: string[] = [];
  const completed = input.plans.filter(p => p.date <= date && p.status === 'completed' && recentSets.some(s => s.sessionId === p.sessionId))
    .sort((a, b) => b.createdAt - a.createdAt);
  const lastSplit = completed[0]?.split;
  const legacy = input.sessions.filter(s => s.date <= date && s.mesocycleWeek > 0 && !input.plans.some(p => p.sessionId === s.id)
    && recentSets.some(set => set.sessionId === s.id && set.date === s.date)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const previous = lastSplit ?? legacy?.splitType;
  const next = previous ? SPLIT_ORDER[(SPLIT_ORDER.indexOf(previous) + 1) % 3] : 'upper_A';
  const hasSoreness = (id: number) => credits.some(c => c.exerciseId === id && c.credit >= 0.5 && context.soreMuscles.includes(c.muscle));
  const available = (id: number) => {
    const ex = exercises.find(e => e.id === id);
    return !!ex && ex.isAvailable === 1 && ex.silhouetteTag !== 'forbidden' && validBaseline(baselines.find(b => b.exerciseId === id), ex) && !hasSoreness(id);
  };
  const recentlyLoaded = (id: number) => {
    const primary = credits.filter(c => c.exerciseId === id && c.credit === 1).map(c => c.muscle);
    return recentSets.some(s => s.sessionId !== input.ignoreSessionIdForRecovery && daysBetween(s.date, date) < 2 && credits.some(c => c.exerciseId === s.exerciseId && c.credit >= 0.5 && primary.includes(c.muscle)));
  };
  const scores = SPLIT_ORDER.map(split => ({ split, score: WORKOUT_GROUPS[split].reduce((sum, group) => {
    const id = group.find(available);
    if (id === undefined) return sum - 5;
    return sum + (recentlyLoaded(id) ? -3 : 1);
  }, split === next ? 3 : 0) })).sort((a, b) => b.score - a.score);
  const split = context.split ?? scores[0].split;
  const items: PlannedExercise[] = [];
  // Reserve one main lift, then select priority / under-served muscles before
  // secondary catalogue slots. Execution is reordered to keep compound lifts first.
  const priority = (id: number) => Math.min(99, ...credits.filter(c => c.exerciseId === id && c.credit === 1).map(c => muscles.find(m => m.code === c.muscle)?.priorityRank ?? 99));
  const deficit = (id: number) => Math.max(0, ...credits.filter(c => c.exerciseId === id && c.credit === 1).map(c => {
    const min = muscles.find(m => m.code === c.muscle)?.weeklySetsMin ?? 0;
    return min ? Math.max(0, (min - (volume[c.muscle] ?? 0)) / min) : 0;
  }));
  const orderedGroups = WORKOUT_GROUPS[split].map((group,index) => ({ group,index,id:group.find(available) })).sort((a,b) => {
    if (a.index === 0) return -1;
    if (b.index === 0) return 1;
    if (a.id === undefined) return 1;
    if (b.id === undefined) return -1;
    return priority(a.id) - priority(b.id) || deficit(b.id) - deficit(a.id) || a.index - b.index;
  });
  if (context.pain) warnings.push('痛みがあるため運動メニューを作成しません。痛みのある動作を中止し、必要に応じてジムのスタッフや医療者に相談してください。');
  if (context.readiness === 'tired') warnings.push('疲労を考慮してセット数を減らし、RIR 3を目標にします。');
  let missing = 0;
  let recovery = 0;
  if (!context.pain) for (const { group } of orderedGroups) {
    const id = group.find(id => available(id) && !recentlyLoaded(id));
    if (id === undefined) {
      if (group.some(available)) recovery++; else missing++;
      continue;
    }
    const ex = exercises.find(e => e.id === id)!;
    const baseline = baselines.find(b => b.exerciseId === id)!;
    let count = context.readiness === 'tired' ? 2 : 3;
    for (const c of credits.filter(c => c.exerciseId === id && c.credit >= 0.5)) {
      const muscle = muscles.find(m => m.code === c.muscle);
      if (muscle && muscle.weeklySetsMax > 0) count = Math.min(count, Math.max(0, Math.floor((muscle.weeklySetsMax - (volume[c.muscle] ?? 0)) / c.credit)));
    }
    if (count < 1) { warnings.push(`${ex.name}：週間の目安上限に達しているため今回は省略。`); continue; }
    const history = previousPerformance(ex, input);
    let weight = baseline.weightKg;
    let reps = Math.max(ex.repRange[0], Math.min(ex.repRange[1], baseline.reps));
    let reason = 'Week0の基準を引き継ぎ、実際の余力を確認';
    if (history.length) {
      weight = Math.min(...history.map(s => s.actualWeight));
      const sameLoad = history.filter(s => s.actualWeight === weight);
      const p = prescribeNextLoad({ weight, reps: Math.min(...sameLoad.map(s => s.actualReps)), rir: Math.min(...sameLoad.map(s => s.actualRir)) }, ex);
      if (sameLoad.length !== history.length && p.targetWeight > weight) { p.targetWeight = weight; p.targetReps = ex.repRange[1]; p.note = '前回は重量が混在。軽い方の重量で全セットを揃える'; }
      weight = p.targetWeight; reps = p.targetReps; reason = p.note;
    } else if (baseline.rir < 2 && ex.increment > 0) {
      weight = roundToIncrement(Math.max(effectiveIncrement(ex, weight), weight - effectiveIncrement(ex, weight)), ex);
      reason = 'Week0で余力が少なかったため、1段階軽くして開始';
    }
    if (ex.increment === 0) weight = 0;
    const targetRir = context.readiness === 'tired' ? 3 : 2;
    if (context.readiness === 'tired' && ex.increment > 0) weight = roundToIncrement(Math.max(effectiveIncrement(ex, weight), weight - effectiveIncrement(ex, weight)), ex);
    const item: PlannedExercise = { exerciseId: id, targetWeight: weight, targetReps: reps, targetRir, sets: count, restSec: ex.restSec, reason, source: history.length ? 'history' : 'baseline' };
    while (item.sets > 0 && estimateMinutes([...items, item], exercises) > context.minutes) item.sets--;
    if (!item.sets) continue;
    items.push(item);
    for (const c of credits.filter(c => c.exerciseId === id)) volume[c.muscle] = (volume[c.muscle] ?? 0) + c.credit * item.sets;
    if (credits.some(c => c.exerciseId === id && c.credit === 1 && muscles.find(m => m.code === c.muscle)?.tag === 'priority')) item.reason += ' · 優先部位';
  }
  if (missing) warnings.push(`${missing}枠は未測定・利用不可・筋肉痛のため省略。Week0全体のやり直しは不要です。`);
  if (recovery) warnings.push(`${recovery}枠は直近2日以内の刺激を考慮して省略。`);
  if (!items.length && !context.pain) warnings.push('今日は回復を優先するか、別の部位を選んでください。未測定の種目はWeek0で個別に追加できます。');
  items.sort((a,b) => {
    const compoundA = exercises.find(e => e.id === a.exerciseId)?.type === 'compound';
    const compoundB = exercises.find(e => e.id === b.exerciseId)?.type === 'compound';
    return Number(compoundB) - Number(compoundA);
  });
  return { date, createdAt: now, split, context, exercises: items, skippedExerciseIds: [], estimatedMinutes: items.length ? estimateMinutes(items, exercises) : 0,
    reason: context.split ? '選択した部位で、Week0・実施履歴・時間・筋肉痛を考慮して作成' : previous ? '前回の実施部位を起点に、直近の刺激と利用可能な種目を比較して選択' : 'Week0の記録から本番を開始。時間内に収まる種目を選択', warnings, status: 'active' };
}

/** Use the alternative's own baseline and reserve volume for the rest of this session. */
export function proposeReplacement(plan: DailyPlan, originalId: number, candidateId: number, input: PlannerInput): PlannedExercise | undefined {
  const original = plan.exercises.find(e => e.exerciseId === originalId);
  const group = WORKOUT_GROUPS[plan.split].find(g => g.includes(originalId));
  if (!original || !group?.includes(candidateId) || plan.exercises.some(e => e.exerciseId === candidateId)
    || input.sets.some(s => s.sessionId === plan.sessionId && s.exerciseId === originalId)) return undefined;
  const candidate = buildDailyPlan({ ...input, context: { ...plan.context, split: plan.split }, ignoreSessionIdForRecovery: plan.sessionId,
    exercises: input.exercises.map(e => e.id === candidateId ? e : { ...e, isAvailable: 0 }) }).exercises.find(e => e.exerciseId === candidateId);
  if (!candidate) return undefined;
  candidate.sets = Math.min(original.sets, candidate.sets);
  const totals = weeklyCredits(input.sets, input.credits, input.date);
  for (const item of plan.exercises.filter(e => e.exerciseId !== originalId && !plan.skippedExerciseIds.includes(e.exerciseId))) {
    const done = input.sets.filter(s => s.sessionId === plan.sessionId && s.exerciseId === item.exerciseId && !s.isWarmup).length;
    for (const c of input.credits.filter(c => c.exerciseId === item.exerciseId)) totals[c.muscle] = (totals[c.muscle] ?? 0) + Math.max(0, item.sets - done) * c.credit;
  }
  for (const c of input.credits.filter(c => c.exerciseId === candidateId && c.credit >= 0.5)) {
    const max = input.muscles.find(m => m.code === c.muscle)?.weeklySetsMax ?? 0;
    if (max > 0) candidate.sets = Math.min(candidate.sets, Math.max(0, Math.floor((max - (totals[c.muscle] ?? 0)) / c.credit)));
  }
  while (candidate.sets > 0 && estimateMinutes(plan.exercises.map(e => e.exerciseId === originalId ? candidate : e), input.exercises) > plan.context.minutes) candidate.sets--;
  if (candidate.sets < 1) return undefined;
  candidate.reason = '器具変更：この種目自身のWeek0・履歴から設定';
  return candidate;
}

export const SORE_GROUPS: { label: string; muscles: MuscleCode[] }[] = [
  { label: '肩', muscles: ['delt_lateral', 'delt_front', 'delt_rear'] }, { label: '背中', muscles: ['lat', 'traps_mid', 'erector'] },
  { label: '胸', muscles: ['chest_upper', 'chest_mid', 'chest_lower'] }, { label: '腕', muscles: ['biceps_long', 'biceps_short', 'triceps', 'brachialis'] },
  { label: '脚・お尻', muscles: ['quads', 'hams', 'glutes', 'calves'] }, { label: '腹筋', muscles: ['abs_rectus'] },
];
