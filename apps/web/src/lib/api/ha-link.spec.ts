import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({ apiGet: vi.fn(), apiPatch: vi.fn() }));

const { apiGet, apiPatch } = await import('./client');
const { fetchHaLink, updateHaLink } = await import('./ha-link');

const linkResponse = {
	linkedHaUsername: 'alice',
	detectedHaUsername: 'alice',
	detectedHaDisplayName: 'Alice'
};

describe('ha-link', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('fetchHaLink GETs the current link', async () => {
		vi.mocked(apiGet).mockResolvedValue(linkResponse);

		await expect(fetchHaLink()).resolves.toEqual(linkResponse);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/ha-link');
	});

	it('updateHaLink PATCHes a new username', async () => {
		vi.mocked(apiPatch).mockResolvedValue(linkResponse);

		await expect(updateHaLink({ haUsername: 'alice' })).resolves.toEqual(linkResponse);
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/ha-link', { haUsername: 'alice' });
	});

	it('updateHaLink PATCHes null to unlink', async () => {
		const unlinked = { ...linkResponse, linkedHaUsername: null };
		vi.mocked(apiPatch).mockResolvedValue(unlinked);

		await expect(updateHaLink({ haUsername: null })).resolves.toEqual(unlinked);
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/ha-link', { haUsername: null });
	});

	it('updateHaLink passes a password through for manual linking', async () => {
		vi.mocked(apiPatch).mockResolvedValue(linkResponse);

		await updateHaLink({ haUsername: 'alice', password: 'secret' });
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/ha-link', {
			haUsername: 'alice',
			password: 'secret'
		});
	});
});
