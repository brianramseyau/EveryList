import { describe, expect, it } from 'vitest';
import { disablePinchZoom } from './pinch-zoom';

// Runs in the "server" (node) project, which has no `window` — exercises the
// SSR/prerendering guard. See pinch-zoom.svelte.spec.ts for the real browser
// behavior.
describe('pinch-zoom (no window)', () => {
	it('disablePinchZoom is a no-op without throwing', () => {
		expect(() => disablePinchZoom()).not.toThrow();
	});
});
