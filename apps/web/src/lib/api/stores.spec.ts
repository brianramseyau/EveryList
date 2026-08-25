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
	attachStore,
	detachStore,
	fetchStoreCategoryOrder,
	fetchStores,
	reorderStoreCategories,
	resetStoreCategoryOrder,
	updateStore
} = await import('./stores');

describe('stores api', () => {
	it('fetchStores GETs the list-scoped collection', () => {
		vi.mocked(apiGet).mockResolvedValue([]);
		fetchStores(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/stores');
	});

	it('fetchStores rethrows the network error when Dexie is not available', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));
		await expect(fetchStores(1)).rejects.toThrow('network down');
	});

	it('attachStore POSTs an existing storeId', () => {
		attachStore(1, { storeId: 20 });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/stores', { storeId: 20 });
	});

	it('attachStore POSTs a new store name', () => {
		attachStore(1, { name: 'Costco' });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/stores', { name: 'Costco' });
	});

	it('detachStore DELETEs the given store', () => {
		detachStore(1, 20);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/stores/20');
	});

	it('updateStore PATCHes the given store', () => {
		updateStore(20, { name: 'Walmart Supercenter' });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/stores/20', { name: 'Walmart Supercenter' });
	});

	it('fetchStoreCategoryOrder GETs the store-scoped order', () => {
		vi.mocked(apiGet).mockResolvedValue([]);
		fetchStoreCategoryOrder(20);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/stores/20/categories');
	});

	it('fetchStoreCategoryOrder rethrows the network error when Dexie is not available', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));
		await expect(fetchStoreCategoryOrder(20)).rejects.toThrow('network down');
	});

	it('reorderStoreCategories PATCHes the new order', () => {
		reorderStoreCategories(20, [{ categoryId: 10, sortOrder: 0 }]);
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/stores/20/categories', {
			categories: [{ categoryId: 10, sortOrder: 0 }]
		});
	});

	it('resetStoreCategoryOrder DELETEs the store-scoped order', () => {
		resetStoreCategoryOrder(20);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/stores/20/categories');
	});
});
