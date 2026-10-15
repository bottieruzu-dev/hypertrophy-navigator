import { db } from '../db';
import { parseNutritionResponse, validateRequest, validProfile, type Ingredient, type MealRequest, type NutritionProfile, type TargetSnapshot } from '../../engine/nutrition';
export async function saveNutritionProfile(profile: NutritionProfile): Promise<void> {
    if (!validProfile(profile))
        throw new Error('プロフィールの数値を確認してください。対応範囲は18〜49歳の一般成人です。');
    await db.settings.put({ key: 'nutritionProfile', value: profile });
}
export async function saveIngredient(food: Ingredient): Promise<void> {
    validateRequest({ id: 'validate', date: '2026-01-01', meal: 'breakfast', createdAt: 1, items: [{ ...food, quantity: 1, unit: 'g' }] });
    await db.ingredients.put(food);
}
export async function saveMealRequest(request: MealRequest): Promise<void> {
    validateRequest(request);
    await db.transaction('rw', [db.mealRequests], async () => {
        const existing = await db.mealRequests.get(request.id);
        if (existing) {
            if (JSON.stringify(existing) !== JSON.stringify(request))
                throw new Error('保存済みの依頼は変更できません。新しい依頼を作成してください。');
        }
        else
            await db.mealRequests.add(request);
    });
}
export async function saveNutritionMeal(requestId: string, text: string, targets: TargetSnapshot, expectedRevision?: number): Promise<void> {
    if (await db.nutritionWorkJobs.get(requestId)) throw new Error('Workの依頼は確認待ちの結果から確定してください。');
    await db.transaction('rw', [db.mealRequests, db.meals], async () => {
        const request = await db.mealRequests.get(requestId);
        if (!request || request.date !== targets.date || !validProfile(targets.profile))
            throw new Error('保存する依頼と目標を確認してください。');
        const { response } = parseNutritionResponse(text, request);
        const existing = await db.meals.get(requestId);
        if (existing && (expectedRevision === undefined || existing.revision !== expectedRevision))
            throw new Error('この依頼は保存済み、または別画面で更新されています。履歴から修正してください。二重加算はしていません。');
        if (!existing && expectedRevision !== undefined)
            throw new Error('修正対象の記録がありません。');
        const replaced = request.replaces && !existing ? await db.meals.get(request.replaces.id) : undefined;
        if (request.replaces && !existing && (!replaced || replaced.voided || replaced.request.date !== request.date || replaced.revision !== request.replaces.revision))
            throw new Error('置き換え対象が更新されています。履歴からやり直してください。');
        await db.meals.put({ id: request.id, request, response, targets: existing?.targets ?? replaced?.targets ?? targets, revision: (existing?.revision ?? 0) + 1, savedAt: Date.now(), voided: existing?.voided ?? false });
        if (replaced)
            await db.meals.update(replaced.id, { voided: true, revision: replaced.revision + 1 });
    });
}
export async function setMealVoided(id: string, voided: boolean): Promise<void> {
    if (await db.nutritionWorkJobs.get(id)) throw new Error('クラウド連携の記録はオンラインで取消・復元してください。');
    await db.transaction('rw', db.meals, async () => {
        const existing = await db.meals.get(id);
        if (!existing)
            throw new Error('対象の記録がありません。');
        if (!voided && (await db.meals.toArray()).some(m => !m.voided && m.id !== id && m.request.replaces?.id === id))
            throw new Error('置き換え後の記録を先に取り消してください。元の記録を二重に加算しないためです。');
        await db.meals.update(id, { voided, revision: existing.revision + 1 });
    });
}
