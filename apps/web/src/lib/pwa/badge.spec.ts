import { describe, expect, it } from 'vitest';
import { getBadgeCount, isBadgingSupported, refreshBadgeCount } from './badge';

// Plain node spec — no `window`/`navigator.setAppBadge`, mirroring install-prompt.spec.ts's
// SSR-guard coverage.
describe('badge without setAppBadge support', () => {
	it('isBadgingSupported is false', () => {
		expect(isBadgingSupported()).toBe(false);
	});

	it('getBadgeCount starts at 0', () => {
		expect(getBadgeCount()).toBe(0);
	});

	it('refreshBadgeCount does not throw when the fetch fails (no auth token in this env)', async () => {
		await expect(refreshBadgeCount()).resolves.toBeUndefined();
	});
});
