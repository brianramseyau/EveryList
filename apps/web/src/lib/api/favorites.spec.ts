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
	it('fetchFavorites GETs the collection', () => {
		fetchFavorites();
		expect(apiGet).toHaveBeenCalledWith('/api/v1/favorites');
	});

	it('createFavorite POSTs the input', () => {
		createFavorite({ name: 'Bananas', defaultQuantity: '1 bunch' });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/favorites', {
			name: 'Bananas',
			defaultQuantity: '1 bunch'
		});
	});

	it('updateFavorite PATCHes the given favorite', () => {
		updateFavorite(1, { defaultQuantity: '2 bunches' });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/favorites/1', { defaultQuantity: '2 bunches' });
	});

	it('deleteFavorite DELETEs the given favorite', () => {
		deleteFavorite(1);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/favorites/1');
	});

	it('addFavoriteToList POSTs to the add-to-list endpoint', () => {
		addFavoriteToList(1, 5);
		expect(apiPost).toHaveBeenCalledWith('/api/v1/favorites/1/add-to-list/5');
	});
});
