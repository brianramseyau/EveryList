import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAppCaches } from './reset';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('clearAppCaches', () => {
	it('unregisters every service worker and deletes every cache when both APIs are available', async () => {
		const unregisterA = vi.fn().mockResolvedValue(true);
		const unregisterB = vi.fn().mockResolvedValue(true);
		const getRegistrations = vi
			.fn()
			.mockResolvedValue([{ unregister: unregisterA }, { unregister: unregisterB }]);
		vi.stubGlobal('navigator', {
			userAgent: window.navigator.userAgent,
			serviceWorker: { getRegistrations }
		});

		const del = vi.fn().mockResolvedValue(true);
		const keys = vi.fn().mockResolvedValue(['api-get-cache', 'workbox-precache-v2']);
		vi.stubGlobal('caches', { keys, delete: del });

		await clearAppCaches();

		expect(unregisterA).toHaveBeenCalled();
		expect(unregisterB).toHaveBeenCalled();
		expect(del).toHaveBeenCalledWith('api-get-cache');
		expect(del).toHaveBeenCalledWith('workbox-precache-v2');
	});

	it('does nothing and does not throw when neither API is available', async () => {
		vi.stubGlobal('navigator', { userAgent: window.navigator.userAgent });
		vi.stubGlobal('caches', undefined);

		await expect(clearAppCaches()).resolves.toBeUndefined();
	});
});
