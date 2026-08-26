import { describe, expect, it, vi } from 'vitest';

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

const { apiGet } = await import('./client');
const { fetchCategoryLearnings } = await import('./category-learnings');

describe('category-learnings api', () => {
	it('fetchCategoryLearnings GETs the list-scoped collection', () => {
		vi.mocked(apiGet).mockResolvedValue([]);
		fetchCategoryLearnings(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/category-learnings');
	});

	it('fetchCategoryLearnings rethrows the network error when Dexie is not available', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));
		await expect(fetchCategoryLearnings(1)).rejects.toThrow('network down');
	});
});
