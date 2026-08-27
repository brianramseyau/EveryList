import type { CategoryLearningDto } from '@everylist/shared';
import { apiGet } from './client';
/* v8 ignore start */
import { getDb } from '$lib/offline/db';
import { withCacheFallback } from './cache-fallback';
/* v8 ignore stop */

/**
 * Fetches a list's learned categorization model (PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md). The server
 * is authoritative, so a successful fetch full-replaces the list's cached row;
 * offline, the previously cached copy is read back instead. Read-only — the
 * model is never edited client-side and never touches the sync queue.
 */
export async function fetchCategoryLearnings(listId: number): Promise<CategoryLearningDto[]> {
	return withCacheFallback(
		async () => {
			const learnings = await apiGet<CategoryLearningDto[]>(
				`/api/v1/lists/${listId}/category-learnings`
			);
			const db = getDb();
			if (db) await db.categoryLearnings.put({ listId, learnings });
			return learnings;
		},
		async () => {
			const db = getDb();
			if (!db) return undefined;
			return (await db.categoryLearnings.get(listId))?.learnings;
		}
	);
}
