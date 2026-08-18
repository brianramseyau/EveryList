import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn(),
	apiDelete: vi.fn()
}));

const { apiGet, apiPatch, apiDelete, apiPost } = await import('./client');
const { addMember, fetchMemberCandidates, fetchMembers, removeMember, updateMemberRole } =
	await import('./members');

describe('members api', () => {
	it('fetchMembers GETs the list-scoped collection', () => {
		fetchMembers(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/members');
	});

	it('fetchMemberCandidates GETs the candidate collection', () => {
		fetchMemberCandidates(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/members/candidates');
	});

	it('addMember POSTs the userId and role', () => {
		addMember(1, 5, 'viewer');
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/members', { userId: 5, role: 'viewer' });
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
