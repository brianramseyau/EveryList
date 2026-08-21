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
const { fetchFolders } = await import('./folders');

afterEach(async () => {
	vi.clearAllMocks();
	await resetDbForTesting();
});

function folderRow(id: number, name: string, sortOrder: number) {
	return {
		id,
		userId: 1,
		name,
		color: '#3b82f6',
		sortOrder,
		createdAt: '2026-08-01T00:00:00.000Z',
		updatedAt: null,
		version: 1
	};
}

describe('fetchFolders (cache hydration)', () => {
	it('caches the response into Dexie', async () => {
		vi.mocked(apiGet).mockResolvedValue([folderRow(1, 'Home', 0)]);

		await fetchFolders();

		expect((await getDb()!.folders.get(1))?.name).toBe('Home');
	});

	it('falls back to cached folders, sorted by sortOrder, when the network fails', async () => {
		vi.mocked(apiGet).mockResolvedValue([folderRow(2, 'Work', 1), folderRow(1, 'Home', 0)]);
		await fetchFolders();
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		const result = await fetchFolders();

		expect(result.map((folder) => folder.id)).toEqual([1, 2]);
	});

	it('rethrows an ApiError without falling back to cache', async () => {
		await getDb()!.folders.put(folderRow(1, 'Home', 0));
		vi.mocked(apiGet).mockRejectedValue(new ApiError(403, 'Forbidden'));

		await expect(fetchFolders()).rejects.toThrow('Forbidden');
	});
});
