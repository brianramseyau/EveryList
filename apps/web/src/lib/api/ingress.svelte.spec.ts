import { afterEach, describe, expect, it } from 'vitest';
import { ingressBase, isIngress, stripIngressPrefix } from './ingress';

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

describe('stripIngressPrefix', () => {
	afterEach(() => {
		delete window.__EVERYLIST_INGRESS_BASE__;
	});

	it('returns the pathname unchanged outside Ingress', () => {
		expect(stripIngressPrefix('/lists')).toBe('/lists');
	});

	it('strips the Ingress prefix', () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(stripIngressPrefix('/api/hassio_ingress/abc123/lists')).toBe('/lists');
	});

	it('resolves the bare prefix to /', () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(stripIngressPrefix('/api/hassio_ingress/abc123')).toBe('/');
	});

	it("collapses the doubled slash Supervisor's own Ingress panel produces", () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(stripIngressPrefix('/api/hassio_ingress/abc123//ha-ingress-entry')).toBe(
			'/ha-ingress-entry'
		);
	});

	it('leaves a pathname outside the Ingress prefix unchanged', () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(stripIngressPrefix('/some-other-path')).toBe('/some-other-path');
	});
});
