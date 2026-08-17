import { beforeAll, describe, expect, it } from 'vitest';
import { disablePinchZoom } from './pinch-zoom';

// Runs in the "client" (real Chromium) project so `window` is the genuine
// browser implementation — see pinch-zoom.spec.ts for the SSR/no-window
// guard. `gesturestart` is WebKit-only and unrecognized by Chromium, but
// dispatching it here still exercises the listener the same way a real
// iOS pinch would trigger it.
describe('pinch-zoom (browser)', () => {
	beforeAll(() => {
		disablePinchZoom();
	});

	it('prevents the default on gesturestart (WebKit pinch-zoom start)', () => {
		const event = new Event('gesturestart', { cancelable: true });

		window.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
	});

	it('prevents the default on a multi-touch touchmove (pinch-zoom fallback)', () => {
		const event = new Event('touchmove', { cancelable: true });
		Object.defineProperty(event, 'touches', { value: [{}, {}] });

		window.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
	});

	it('leaves a single-touch touchmove alone (ordinary scroll/swipe)', () => {
		const event = new Event('touchmove', { cancelable: true });
		Object.defineProperty(event, 'touches', { value: [{}] });

		window.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
	});
});
