import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn(),
	apiDelete: vi.fn()
}));

const { apiGet, apiPost, apiPatch, apiDelete } = await import('./client');
const {
	createItem,
	deleteItem,
	fetchItems,
	fetchRecentItems,
	importItems,
	restoreItem,
	updateItem
} = await import('./items');

describe('items api', () => {
	it('fetchItems GETs the list-scoped collection', () => {
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
});
