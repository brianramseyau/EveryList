import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn(),
	apiDelete: vi.fn()
}));

const { apiGet, apiPost, apiPatch, apiDelete } = await import('./client');
const { addFavoriteToList, createFavorite, deleteFavorite, fetchFavorites, updateFavorite } =
	await import('./favorites');

describe('favorites api', () => {
	it('fetchFavorites GETs the list-scoped collection', () => {
		fetchFavorites(5);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/5/favorites');
	});

	it('createFavorite POSTs the input to the list-scoped collection', () => {
		createFavorite(5, { name: 'Bananas', defaultQuantity: '1 bunch' });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/5/favorites', {
			name: 'Bananas',
			defaultQuantity: '1 bunch'
		});
	});

	it('updateFavorite PATCHes the given favorite within its list', () => {
		updateFavorite(5, 1, { defaultQuantity: '2 bunches' });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/5/favorites/1', {
			defaultQuantity: '2 bunches'
		});
	});

	it('deleteFavorite DELETEs the given favorite within its list', () => {
		deleteFavorite(5, 1);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/5/favorites/1');
	});

	it('addFavoriteToList POSTs to the add-to-list endpoint', () => {
		addFavoriteToList(5, 1);
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/5/favorites/1/add-to-list');
	});
});
