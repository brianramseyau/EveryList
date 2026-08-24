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
	bulkImportCategories,
	createCategory,
	deleteCategory,
	fetchCategories,
	importCategories,
	reorderCategories,
	updateCategory
} = await import('./categories');

describe('categories api', () => {
	it('fetchCategories GETs the list-scoped collection', () => {
		vi.mocked(apiGet).mockResolvedValue([]);
		fetchCategories(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/categories');
	});

	it('fetchCategories rethrows the network error when Dexie is not available', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));
		await expect(fetchCategories(1)).rejects.toThrow('network down');
	});

	it('createCategory POSTs the input', () => {
		createCategory(1, { name: 'Snacks', icon: 'cookie' });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/categories', {
			name: 'Snacks',
			icon: 'cookie'
		});
	});

	it('updateCategory PATCHes the given category', () => {
		updateCategory(1, 10, { name: 'Fruit & Veg' });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/categories/10', { name: 'Fruit & Veg' });
	});

	it('deleteCategory DELETEs the given category', () => {
		deleteCategory(1, 10);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/categories/10');
	});

	it('reorderCategories PATCHes the new order', () => {
		reorderCategories(1, [11, 10]);
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/categories/reorder', {
			order: [11, 10]
		});
	});

	it('importCategories POSTs the source list and selected category ids', () => {
		importCategories(1, { sourceListId: 2, categoryIds: [10, 11] });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/categories/import', {
			sourceListId: 2,
			categoryIds: [10, 11]
		});
	});

	it('bulkImportCategories POSTs the pasted text', () => {
		bulkImportCategories(1, 'Produce\nDairy');
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/categories/bulk-import', {
			text: 'Produce\nDairy'
		});
	});
});
