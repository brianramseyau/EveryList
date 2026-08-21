import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPing } from './ping';

function response(init: { ok: boolean; contentType?: string }) {
	return {
		ok: init.ok,
		headers: { get: () => init.contentType ?? null }
	};
}

describe('fetchPing', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns true for a 2xx JSON response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(response({ ok: true, contentType: 'application/json' }))
		);

		await expect(fetchPing()).resolves.toBe(true);
		expect(fetch).toHaveBeenCalledWith('/api/v1/ping', {
			cache: 'no-store',
			headers: { Accept: 'application/json' },
			signal: expect.any(AbortSignal)
		});
	});

	it('returns false for a non-2xx response (e.g. a proxy 503)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(response({ ok: false, contentType: 'application/json' }))
		);

		await expect(fetchPing()).resolves.toBe(false);
	});

	it('returns false when a proxy answers with an HTML page instead of JSON', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(response({ ok: true, contentType: 'text/html' }))
		);

		await expect(fetchPing()).resolves.toBe(false);
	});

	it('returns false when the response lacks a content-type header', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: { get: () => null } }));

		await expect(fetchPing()).resolves.toBe(false);
	});

	it('returns false when the request rejects', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

		await expect(fetchPing()).resolves.toBe(false);
	});

	it('prefixes the ping with an explicitly-given base URL, e.g. a /server-setup candidate', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(response({ ok: true, contentType: 'application/json' }))
		);

		await expect(fetchPing('https://everylist.example.com')).resolves.toBe(true);
		expect(fetch).toHaveBeenCalledWith('https://everylist.example.com/api/v1/ping', {
			cache: 'no-store',
			headers: { Accept: 'application/json' },
			signal: expect.any(AbortSignal)
		});
	});

	it('returns false when the request is aborted for taking too long', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockRejectedValue(new DOMException('Signal timed out', 'TimeoutError'))
		);

		await expect(fetchPing()).resolves.toBe(false);
	});
});
