import Dexie, { type Table } from 'dexie';
import type {
  Muscle, Exercise, MuscleCredit, SessionRecord, SetRecord,
  BodyMetric, NutritionLog, CardioLog, EventLog,
  ExerciseBaseline, Food, Setting,
} from './types';

export class HypertrophyDB extends Dexie {
  muscles!: Table<Muscle, string>;
  exercises!: Table<Exercise, number>;
  muscleCredits!: Table<MuscleCredit, [number, string]>;
  sessions!: Table<SessionRecord, number>;
  sets!: Table<SetRecord, number>;
  bodyMetrics!: Table<BodyMetric, string>;
  nutritionLogs!: Table<NutritionLog, string>;
  cardioLogs!: Table<CardioLog, number>;
  events!: Table<EventLog, number>;
  baselines!: Table<ExerciseBaseline, number>;
  foods!: Table<Food, number>;
  settings!: Table<Setting, string>;

  constructor() {
    super('HypertrophyNavigatorDB');

    this.version(1).stores({
      muscles:       'code, priorityRank, tag',
      exercises:     'id, name, equipment, type, silhouetteTag, isAvailable',
      muscleCredits: '[exerciseId+muscle], exerciseId, muscle, credit',
      sessions:      '++id, date, splitType, mesocycleWeek, isDeload',
      sets:          '++id, sessionId, exerciseId, date, [exerciseId+date], [sessionId+setOrder]',
      bodyMetrics:    'date',
      nutritionLogs: 'date',
      cardioLogs:    '++id, date',
      events:        '++id, date, eventType, acknowledged',
      baselines:     'exerciseId, calibratedAt',
      foods:         'id, tag',
      settings:      'key',
    });
  }
}

export const db = new HypertrophyDB();