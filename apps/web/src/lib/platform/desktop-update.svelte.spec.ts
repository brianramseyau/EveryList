import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkForDesktopUpdate } from './desktop-update';

// Runs in the "client" (real Chromium) project so `window` is genuine — see
// desktop-update.spec.ts for the SSR/no-window guard.
describe('checkForDesktopUpdate (browser)', () => {
	afterEach(() => {
		delete window.everylistDesktop;
	});

	it('reports unavailable when the preload bridge was never exposed', async () => {
		expect(await checkForDesktopUpdate()).toEqual({ status: 'unavailable' });
	});

	it('relays an available update from the bridge', async () => {
		window.everylistDesktop = {
			version: '1.0.0',
			platform: 'darwin',
			checkForUpdate: vi.fn().mockResolvedValue({
				status: 'update-available',
				latestVersion: 'v1.1.0',
				url: 'https://example.com/releases/v1.1.0'
			})
		};
		expect(await checkForDesktopUpdate()).toEqual({
			status: 'update-available',
			latestVersion: 'v1.1.0',
			url: 'https://example.com/releases/v1.1.0'
		});
	});

	it('relays an up-to-date result from the bridge', async () => {
		window.everylistDesktop = {
			version: '1.0.0',
			platform: 'darwin',
			checkForUpdate: vi.fn().mockResolvedValue({ status: 'up-to-date' })
		};
		expect(await checkForDesktopUpdate()).toEqual({ status: 'up-to-date' });
	});

	it('relays an error result from the bridge', async () => {
		window.everylistDesktop = {
			version: '1.0.0',
			platform: 'darwin',
			checkForUpdate: vi.fn().mockResolvedValue({ status: 'error', message: 'nope' })
		};
		expect(await checkForDesktopUpdate()).toEqual({ status: 'error', message: 'nope' });
	});
});
