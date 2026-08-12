import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMeta } from './meta';

describe('fetchMeta', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns the parsed meta response on success', async () => {
		const body = { version: 'nightly', commit: 'abc123', builtAt: '2026-08-12T00:00:00.000Z' };
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
		);

		await expect(fetchMeta()).resolves.toEqual(body);
	});

	it('throws when the response is not ok', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

		await expect(fetchMeta()).rejects.toThrow('GET /api/v1/meta failed: 500');
	});
});
