import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn(),
	apiDelete: vi.fn()
}));

const { apiGet, apiPost, apiDelete } = await import('./client');
const { acceptInvite, createInvite, fetchInvitePreview, fetchInvites, revokeInvite } =
	await import('./invites');

describe('invites api', () => {
	it('fetchInvites GETs the list-scoped collection', () => {
		fetchInvites(1);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/invites');
	});

	it('createInvite POSTs the requested role', () => {
		createInvite(1, 'editor');
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/invites', { role: 'editor' });
	});

	it('revokeInvite DELETEs the given invite', () => {
		revokeInvite(1, 7);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/invites/7');
	});

	it('fetchInvitePreview GETs the unauthenticated preview endpoint', () => {
		fetchInvitePreview('abc123');
		expect(apiGet).toHaveBeenCalledWith('/api/v1/invites/abc123');
	});

	it('acceptInvite POSTs to the accept endpoint', () => {
		acceptInvite('abc123');
		expect(apiPost).toHaveBeenCalledWith('/api/v1/invites/abc123/accept');
	});
});
