import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn(),
	apiDelete: vi.fn(),
	ApiError: class ApiError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.status = status;
		}
	}
}));

const { apiGet, ApiError } = await import('./client');
const { getDb, resetDbForTesting } = await import('$lib/offline/db');
const { fetchCategoryLearnings } = await import('./category-learnings');

afterEach(async () => {
	vi.clearAllMocks();
	await resetDbForTesting();
});

describe('fetchCategoryLearnings (cache hydration)', () => {
	it("full-replaces the list's cached model with the server response", async () => {
		const learnings = [
			{ categoryId: 7, token: 'apple', count: 2, lastSeenAt: '2026-08-20T00:00:00.000Z' }
		];
		vi.mocked(apiGet).mockResolvedValue(learnings);

		await fetchCategoryLearnings(1);

		const cached = await getDb()!.categoryLearnings.get(1);
		expect(cached).toEqual({ listId: 1, learnings });
	});

	it('replaces a previously cached model rather than appending to it', async () => {
		const db = getDb()!;
		await db.categoryLearnings.put({
			listId: 1,
			learnings: [
				{ categoryId: 7, token: 'apple', count: 2, lastSeenAt: '2026-08-20T00:00:00.000Z' },
				{ categoryId: 8, token: 'banana', count: 1, lastSeenAt: '2026-08-20T00:00:00.000Z' }
			]
		});
		vi.mocked(apiGet).mockResolvedValue([
			{ categoryId: 7, token: 'apple', count: 3, lastSeenAt: '2026-08-21T00:00:00.000Z' }
		]);

		await fetchCategoryLearnings(1);

		const cached = await getDb()!.categoryLearnings.get(1);
		expect(cached?.learnings).toHaveLength(1);
		expect(cached?.learnings[0]!.count).toBe(3);
	});

	it('falls back to the cached model when the network fails', async () => {
		const learnings = [
			{ categoryId: 7, token: 'apple', count: 2, lastSeenAt: '2026-08-20T00:00:00.000Z' }
		];
		vi.mocked(apiGet).mockResolvedValue(learnings);
		await fetchCategoryLearnings(1);
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		const result = await fetchCategoryLearnings(1);

		expect(result).toEqual(learnings);
	});

	it('rethrows an ApiError without falling back to cache', async () => {
		vi.mocked(apiGet).mockRejectedValue(new ApiError(403, 'Forbidden'));

		await expect(fetchCategoryLearnings(1)).rejects.toThrow('Forbidden');
	});

	it('rethrows the network error when the list has never been cached', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		await expect(fetchCategoryLearnings(1)).rejects.toThrow('network down');
	});
});
