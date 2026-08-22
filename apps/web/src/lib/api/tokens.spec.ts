import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn(),
	apiDelete: vi.fn()
}));

const { apiGet, apiPost, apiPatch, apiDelete } = await import('./client');
const { createToken, fetchTokens, revokeToken, updateToken } = await import('./tokens');

describe('tokens api', () => {
	it('fetchTokens GETs the collection', () => {
		fetchTokens();
		expect(apiGet).toHaveBeenCalledWith('/api/v1/tokens');
	});

	it('createToken POSTs the name, listIds, and role', () => {
		createToken('Home Assistant', [1, 2], 'editor');
		expect(apiPost).toHaveBeenCalledWith('/api/v1/tokens', {
			name: 'Home Assistant',
			listIds: [1, 2],
			role: 'editor'
		});
	});

	it('updateToken PATCHes the given token with a replaced grant set and name', () => {
		updateToken(5, [1, 2], 'viewer', 'Alexa');
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/tokens/5', {
			name: 'Alexa',
			listIds: [1, 2],
			role: 'viewer'
		});
	});

	it('updateToken omits name when not given', () => {
		updateToken(5, [1], 'editor');
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/tokens/5', {
			name: undefined,
			listIds: [1],
			role: 'editor'
		});
	});

	it('revokeToken DELETEs the given token', () => {
		revokeToken(5);
		expect(apiDelete).toHaveBeenCalledWith('/api/v1/tokens/5');
	});
});
