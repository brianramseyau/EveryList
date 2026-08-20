import { describe, expect, it } from 'vitest';
import { resetConnectivityForTesting, startConnectivityMonitor } from './connectivity.svelte';

// Plain node spec — no `window` global, mirroring flush-loop.spec.ts's SSR-guard coverage.
describe('connectivity without a window (SSR/prerender)', () => {
	it('startConnectivityMonitor is a no-op', () => {
		expect(() => startConnectivityMonitor()).not.toThrow();
	});

	it('resetConnectivityForTesting is a no-op', () => {
		expect(() => resetConnectivityForTesting()).not.toThrow();
	});
});
