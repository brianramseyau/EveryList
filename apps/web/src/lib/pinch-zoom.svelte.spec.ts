import { beforeAll, describe, expect, it } from 'vitest';
import { disablePinchZoom } from './pinch-zoom';

// Runs in the "client" (real Chromium) project so `window` is the genuine
// browser implementation — see pinch-zoom.spec.ts for the SSR/no-window
// guard. `gesturestart`/`gesturechange` are WebKit-only and unrecognized by
// Chromium, but dispatching them here still exercises the listeners the
// same way a real iOS pinch would trigger them.
describe('pinch-zoom (browser)', () => {
	beforeAll(() => {
		disablePinchZoom();
	});

	it('prevents the default on gesturestart (WebKit pinch-zoom start)', () => {
		const event = new Event('gesturestart', { cancelable: true });

		window.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
	});

	it('prevents the default on gesturechange (WebKit incremental pinch scaling)', () => {
		const event = new Event('gesturechange', { cancelable: true });

		window.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
	});

	it('leaves an ordinary touchmove alone — no listener registered for it, unlike Android which relies on touch-action instead', () => {
		const event = new Event('touchmove', { cancelable: true });
		Object.defineProperty(event, 'touches', { value: [{}, {}] });

		window.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
	});
});
