import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDebugInfo } from './debug';

describe('fetchDebugInfo', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns the parsed debug response on success', async () => {
		const body = {
			app: {
				version: 'nightly',
				commit: 'abc123',
				builtAt: 'unknown',
				nodeEnv: 'test',
				appUrl: ''
			},
			runtime: {
				nodeVersion: 'v24.0.0',
				platform: 'linux',
				arch: 'x64',
				pid: 1,
				uptimeSeconds: 5,
				memoryUsageMb: { rss: 1, heapTotal: 1, heapUsed: 1, external: 1 }
			},
			request: { hostHeader: 'example.com', protocol: 'https', ip: '127.0.0.1' },
			env: {}
		};
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
		);

		await expect(fetchDebugInfo()).resolves.toEqual(body);
	});

	it('throws when the response is not ok', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

		await expect(fetchDebugInfo()).rejects.toThrow('Request failed with status 403');
	});
});
