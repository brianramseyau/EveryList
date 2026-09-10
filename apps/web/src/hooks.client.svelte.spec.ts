import { afterEach, describe, expect, it } from 'vitest';
import { reroute } from './hooks.client';

describe('hooks.client reroute', () => {
	afterEach(() => {
		delete window.__EVERYLIST_INGRESS_BASE__;
	});

	it('leaves the URL unchanged outside Ingress', () => {
		expect(reroute({ url: new URL('https://example.com/lists') })).toBeUndefined();
	});

	it('strips the Ingress prefix so the router can match the real route', () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(
			reroute({
				url: new URL('https://homeassistant.local/api/hassio_ingress/abc123/ha-ingress-entry')
			})
		).toBe('/ha-ingress-entry');
	});

	it('resolves the bare prefix to /', () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(reroute({ url: new URL('https://homeassistant.local/api/hassio_ingress/abc123') })).toBe(
			'/'
		);
	});

	it('leaves a URL outside the Ingress prefix unchanged', () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(
			reroute({ url: new URL('https://homeassistant.local/some-other-path') })
		).toBeUndefined();
	});
});
