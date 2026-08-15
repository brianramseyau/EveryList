import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn(),
	apiDelete: vi.fn()
}));

const { apiGet, apiPost, apiPatch, apiDelete } = await import('./client');
const { createList, deleteList, emailExportList, fetchList, fetchLists, updateList } =
	await import('./lists');

describe('lists api', () => {
	it('fetchLists GETs the collection', () => {
		fetchLists();
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists');
	});

	it('fetchList GETs a single list by id', () => {
		fetchList(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1');
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
});
