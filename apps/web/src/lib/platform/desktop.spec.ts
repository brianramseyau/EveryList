import { describe, expect, it } from 'vitest';
import { desktopInfo, isDesktop, isRemoteClient } from './desktop';

// This runs in the "server" (node) project, which has no `window` — it exercises the
// SSR/prerendering guard. See desktop.svelte.spec.ts for the real-browser behavior.
describe('desktop platform detection (no window)', () => {
	it('isDesktop is false without throwing', () => {
		expect(isDesktop()).toBe(false);
	});

	it('desktopInfo is null without throwing', () => {
		expect(desktopInfo()).toBeNull();
	});

	it('isRemoteClient is false (Capacitor is also not native here)', () => {
		expect(isRemoteClient()).toBe(false);
	});
});
