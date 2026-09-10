import { afterEach, describe, expect, it } from 'vitest';
import { ingressBase, isIngress } from './ingress';

// Runs in the "client" (real Chromium) project so `window` is the genuine
// browser object, not a jsdom-less no-op — see ingress.spec.ts for the
// SSR/no-window guard.
describe('ingress (browser)', () => {
	afterEach(() => {
		delete window.__EVERYLIST_INGRESS_BASE__;
	});

	it('is empty by default — same-origin, like the plain Docker/PWA build', () => {
		expect(ingressBase()).toBe('');
		expect(isIngress()).toBe(false);
	});

	it('reflects the global injected by the API on an Ingress request', () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(ingressBase()).toBe('/api/hassio_ingress/abc123');
		expect(isIngress()).toBe(true);
	});
});
