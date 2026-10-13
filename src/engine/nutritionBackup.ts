import type { NutritionLog } from '../db/types';
import { MEALS, NUTRIENTS, parseNutritionResponse, validateRequest, validDate, validProfile, type Ingredient, type MealRecord, type MealRequest, type NutritionProfile, type NutritionDraft } from './nutrition';
export interface NutritionBackupData {
    app: 'HypertrophyNutrition';
    version: 1;
    profile: NutritionProfile | null;
    ingredients: Ingredient[];
    requests: MealRequest[];
    records: MealRecord[];
    legacy: NutritionLog[];
    drafts?: NutritionDraft[];
}
export const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}` : JSON.stringify(value);
export function parseNutritionBackup(text: string): NutritionBackupData {
    try {
        if (text.length > 20 * 1024 * 1024)
            throw new Error();
        const b = JSON.parse(text) as NutritionBackupData;
        if (b?.app !== 'HypertrophyNutrition' || b.version !== 1 || (b.profile !== null && !validProfile(b.profile)))
            throw new Error();
        for (const key of ['ingredients', 'requests', 'records', 'legacy'] as const)
            if (!Array.isArray(b[key]) || b[key].length > 10000)
                throw new Error();
        if (b.drafts !== undefined) {
            if (!Array.isArray(b.drafts) || b.drafts.length > 10000 || new Set(b.drafts.map(d => d.date)).size !== b.drafts.length)
                throw new Error();
            for (const d of b.drafts) {
                if (!validDate(d.date) || !Object.hasOwn(MEALS, d.meal) || !Array.isArray(d.items) || d.items.length > 100)
                    throw new Error();
                if (d.items.length) {
                    for (const i of d.items)
                        if (!Number.isFinite(i.quantity) || i.quantity < 0 || i.quantity > 10000)
                            throw new Error();
                    validateRequest({ id: 'draft', date: d.date, meal: d.meal, createdAt: 1, items: d.items.map(i => ({ ...i, quantity: i.quantity || 1 })), ...(d.replaces ? { replaces: d.replaces } : {}) });
                }
            }
        }
        for (const food of b.ingredients)
            validateRequest({ id: 'validation', date: '2026-01-01', meal: 'lunch', createdAt: 1, items: [{ ...food, quantity: 1, unit: 'g' }] });
        for (const r of b.requests)
            validateRequest(r);
        for (const record of b.records) {
            validateRequest(record.request);
            if (record.id !== record.request.id || !b.requests.some(r => canonical(r) === canonical(record.request)) || !Number.isInteger(record.revision) || record.revision < 1 || typeof record.voided !== 'boolean' || !Number.isFinite(record.savedAt) || record.savedAt <= 0)
                throw new Error();
            if (!record.targets || !validProfile(record.targets.profile) || record.targets.date !== record.request.date || !Number.isFinite(record.targets.weightKg) || record.targets.weightKg < 30 || record.targets.weightKg > 250 || !Number.isFinite(record.targets.estimatedTdee) || (record.targets.weightDate !== null && !validDate(record.targets.weightDate)) || (record.targets.weightAverage7 !== null && !Number.isFinite(record.targets.weightAverage7)))
                throw new Error();
            for (const n of NUTRIENTS)
                if (!Number.isFinite(record.targets.values[n.key]) || record.targets.values[n.key] < 0)
                    throw new Error();
            record.response = parseNutritionResponse(JSON.stringify(record.response), record.request).response;
            if (!record.voided && record.request.replaces) {
                const parent = b.records.find(r => r.id === record.request.replaces!.id);
                if (!parent || !parent.voided || parent.request.date !== record.request.date)
                    throw new Error();
            }
        }
        for (const row of b.legacy) {
            if (!validDate(row.date))
                throw new Error();
            for (const k of ['estimatedTdee', 'targetKcal', 'targetP', 'targetF', 'targetC', 'proteinCoef', 'proteinCheckedG'] as const)
                if (!Number.isFinite(row[k]) || row[k] < 0)
                    throw new Error();
            if (![0, 1].includes(row.isRefeed) || ![0, 1].includes(row.isDietBreak))
                throw new Error();
        }
        for (const [rows, key] of [[b.ingredients, 'id'], [b.requests, 'id'], [b.records, 'id'], [b.legacy, 'date']] as const)
            if (new Set(rows.map(r => (r as unknown as Record<string, unknown>)[key])).size !== rows.length)
                throw new Error();
        return b;
    }
    catch {
        throw new Error('対応する栄養バックアップではないか、記録の形式が不正です。既存の記録は変更していません。');
    }
}
