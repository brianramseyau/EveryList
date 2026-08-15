import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn(),
	apiDelete: vi.fn()
}));

const { apiGet, apiPost, apiPatch, apiDelete } = await import('./client');
const { createFolder, deleteFolder, fetchFolders, updateFolder } = await import('./folders');

describe('folders api', () => {
	it('fetchFolders GETs the collection', () => {
		fetchFolders();
		expect(apiGet).toHaveBeenCalledWith('/api/v1/folders');
	});

	it('createFolder POSTs the input', () => {
		createFolder({ name: 'Groceries' });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/folders', { name: 'Groceries' });
	});

	it('updateFolder PATCHes the given id', () => {
		updateFolder(1, { name: 'Renamed' });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/folders/1', { name: 'Renamed' });
	});

	it('deleteFolder DELETEs the given id', () => {
		deleteFolder(1);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/folders/1');
	});
});
