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

const { apiGet, apiPost, apiPatch, apiDelete, ApiError } = await import('./client');
const { createList, deleteList, emailExportList, fetchList, fetchLists, updateList, reorderLists } =
	await import('./lists');

describe('lists api', () => {
	it('fetchLists GETs the collection', () => {
		vi.mocked(apiGet).mockResolvedValue([]);
		fetchLists();
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists');
	});

	it('fetchList GETs a single list by id', () => {
		vi.mocked(apiGet).mockResolvedValue({ id: 1 });
		fetchList(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1');
	});

	it('fetchLists rethrows the network error when Dexie is not available', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));
		await expect(fetchLists()).rejects.toThrow('network down');
	});

	it('fetchList rethrows the network error when Dexie is not available', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));
		await expect(fetchList(1)).rejects.toThrow('network down');
	});

	it('fetchLists rethrows an ApiError without falling back', async () => {
		vi.mocked(apiGet).mockRejectedValue(new ApiError(403, 'Forbidden'));
		await expect(fetchLists()).rejects.toThrow('Forbidden');
	});

	it('createList POSTs the input', () => {
		createList({ name: 'Groceries' });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists', { name: 'Groceries' });
	});

	it('updateList PATCHes the given id', () => {
		updateList(1, { archived: true });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1', { archived: true });
	});

	it('updateList PATCHes a folderId assignment', () => {
		updateList(1, { folderId: 5 });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1', { folderId: 5 });
	});

	it('updateList PATCHes a badgeExcluded toggle', () => {
		updateList(1, { badgeExcluded: true });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1', { badgeExcluded: true });
	});

	it('emailExportList POSTs the recipient email', () => {
		emailExportList(1, 'friend@example.com');
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/export/email', {
			email: 'friend@example.com'
		});
	});

	it('deleteList DELETEs the given id', () => {
		deleteList(1);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1');
	});

	it('reorderLists PATCHes the full desired order', () => {
		reorderLists([3, 1, 2]);
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/reorder', { order: [3, 1, 2] });
	});
});
