import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn(),
	apiDelete: vi.fn()
}));

const { apiGet, apiPatch, apiDelete } = await import('./client');
const { fetchMembers, removeMember, updateMemberRole } = await import('./members');

describe('members api', () => {
	it('fetchMembers GETs the list-scoped collection', () => {
		fetchMembers(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/members');
	});

	it('updateMemberRole PATCHes the given member', () => {
		updateMemberRole(1, 5, 'viewer');
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/members/5', { role: 'viewer' });
	});

	it('removeMember DELETEs the given member', () => {
		removeMember(1, 5);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/members/5');
	});
});
