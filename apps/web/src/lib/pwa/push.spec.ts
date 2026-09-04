import { describe, expect, it } from 'vitest';
import { isPushSupported, isSubscribed, requestPermissionAndSubscribe, unsubscribe } from './push';

// Plain node spec — no `window`/`navigator.serviceWorker`, mirroring
// badge.spec.ts's SSR-guard coverage.
describe('push without ServiceWorker/PushManager support', () => {
	it('isPushSupported is false', () => {
		expect(isPushSupported()).toBe(false);
	});

	it('isSubscribed is false (no localStorage in this env)', () => {
		expect(isSubscribed()).toBe(false);
	});

	it('requestPermissionAndSubscribe is a no-op', async () => {
		await expect(requestPermissionAndSubscribe()).resolves.toBe(false);
	});

	it('unsubscribe does not throw', async () => {
		await expect(unsubscribe()).resolves.toBeUndefined();
	});
});
