import { describe, expect, it } from 'vitest';
import { initInstallPrompt, isIOSSafari, isStandalone, promptInstall } from './install-prompt';

// Plain node spec — no `window`/`navigator`, mirroring realtime.spec.ts's SSR-guard coverage.
describe('install-prompt without a window (SSR/prerender)', () => {
	it('initInstallPrompt is a no-op', () => {
		expect(() => initInstallPrompt()).not.toThrow();
	});

	it('isStandalone is false', () => {
		expect(isStandalone()).toBe(false);
	});

	it("isIOSSafari is false against Node's own non-browser navigator.userAgent", () => {
		expect(isIOSSafari()).toBe(false);
	});

	it('promptInstall resolves without a captured prompt', async () => {
		await expect(promptInstall()).resolves.toBeUndefined();
	});
});
