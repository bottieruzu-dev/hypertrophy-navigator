import { db } from '../db';
import type { NutritionProfile, NutritionDraft } from '../../engine/nutrition';
import { canonical, parseNutritionBackup, type NutritionBackupData } from '../../engine/nutritionBackup';
export async function exportNutritionBackup(): Promise<NutritionBackupData> { return db.transaction('r', [db.settings, db.ingredients, db.mealRequests, db.meals, db.nutritionLogs], async () => ({ app: 'HypertrophyNutrition', version: 1, profile: (await db.settings.get('nutritionProfile'))?.value as NutritionProfile ?? null, ingredients: await db.ingredients.toArray(), requests: await db.mealRequests.toArray(), records: await db.meals.toArray(), legacy: await db.nutritionLogs.toArray(), drafts: (await db.settings.where('key').startsWith('nutritionDraft:').toArray()).map(s => s.value as NutritionDraft) })); }
export async function restoreNutritionBackup(text: string): Promise<void> {
    const b = parseNutritionBackup(text);
    await db.transaction('rw', [db.settings, db.ingredients, db.mealRequests, db.meals, db.nutritionLogs], async () => {
        for (const food of b.ingredients) {
            const old = await db.ingredients.get(food.id);
            if (old && canonical(old) !== canonical(food))
                throw new Error('食材の同じIDに異なる内容があります。復元を中止しました。');
            if (!old)
                await db.ingredients.add(food);
        }
        for (const r of b.requests) {
            const old = await db.mealRequests.get(r.id);
            if (old && canonical(old) !== canonical(r))
                throw new Error('計算依頼が競合しています。復元を中止しました。');
            if (!old)
                await db.mealRequests.add(r);
        }
        for (const r of b.records) {
            const old = await db.meals.get(r.id);
            if (old && canonical(old) !== canonical(r))
                throw new Error('食事記録が競合しています。復元を中止しました。');
            if (!old)
                await db.meals.add(r);
        }
        for (const row of b.legacy) {
            const old = await db.nutritionLogs.get(row.date);
            if (old && canonical(old) !== canonical(row))
                throw new Error('旧栄養記録が競合しています。復元を中止しました。');
            if (!old)
                await db.nutritionLogs.add(row);
        }
        if (b.profile && !(await db.settings.get('nutritionProfile')))
            await db.settings.put({ key: 'nutritionProfile', value: b.profile });
        for (const draft of b.drafts ?? []) {
            const key = 'nutritionDraft:' + draft.date;
            if (!(await db.settings.get(key)))
                await db.settings.put({ key, value: draft });
        }
    });
}
