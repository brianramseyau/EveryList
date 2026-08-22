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

const { apiGet, apiPost, apiPatch, apiDelete } = await import('./client');
const {
	createItem,
	deleteItem,
	fetchItems,
	fetchRecentItemNames,
	fetchRecentItems,
	importItems,
	moveItem,
	purgeItem,
	restoreItem,
	updateItem
} = await import('./items');

describe('items api', () => {
	it('fetchItems GETs the list-scoped collection', () => {
		vi.mocked(apiGet).mockResolvedValue([]);
		fetchItems(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/items');
	});

	it('fetchRecentItems GETs the recently-deleted collection', () => {
		fetchRecentItems(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/items/recent');
	});

	it('restoreItem POSTs to the restore endpoint', () => {
		restoreItem(1, 100);
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/items/100/restore');
	});

	it('purgeItem DELETEs the purge endpoint', () => {
		purgeItem(1, 100);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/items/100/purge');
	});

	it('moveItem PATCHes the move endpoint with the target previousItemId', () => {
		moveItem(1, 100, 42);
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/items/100/move', {
			previousItemId: 42
		});
	});

	it('moveItem PATCHes null to move an item to the front', () => {
		moveItem(1, 100, null);
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/items/100/move', {
			previousItemId: null
		});
	});

	it('createItem POSTs the input', () => {
		createItem(1, { name: 'Bananas', quantity: '2' });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/items', {
			name: 'Bananas',
			quantity: '2'
		});
	});

	it('importItems POSTs the pasted text', () => {
		importItems(1, 'Milk\nBread');
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/items/import', { text: 'Milk\nBread' });
	});

	it('updateItem PATCHes the given item', () => {
		updateItem(1, 100, { checked: true });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/items/100', { checked: true });
	});

	it('updateItem PATCHes a storeId tag', () => {
		updateItem(1, 100, { storeId: 5 });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/items/100', { storeId: 5 });
	});

	it('updateItem PATCHes a price in cents', () => {
		updateItem(1, 100, { price: 399 });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/items/100', { price: 399 });
	});

	it('deleteItem DELETEs the given item', () => {
		deleteItem(1, 100);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/items/100');
	});

	it('fetchRecentItemNames GETs the recent-names endpoint', () => {
		vi.mocked(apiGet).mockResolvedValue(['Bananas']);
		fetchRecentItemNames(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/items/recent-names');
	});

	it('fetchRecentItemNames falls back to an empty list when the request fails and Dexie is unavailable', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));
		await expect(fetchRecentItemNames(1)).resolves.toEqual([]);
	});

	it('fetchItems rethrows the network error when Dexie is not available', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));
		await expect(fetchItems(1)).rejects.toThrow('network down');
	});
});
