import { afterEach, describe, expect, it } from 'vitest';
import { reroute } from './hooks';

describe('hooks reroute', () => {
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

	it("collapses the doubled slash Supervisor's own Ingress panel produces", () => {
		// Live-confirmed: Supervisor concatenates a trailing-slash base with ingress_entry's own
		// leading slash, producing a real double slash in the browser's actual URL - not something
		// this app controls. Un-normalized, this rendered SvelteKit's own "Not found" error.
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(
			reroute({
				url: new URL('https://homeassistant.local/api/hassio_ingress/abc123//ha-ingress-entry')
			})
		).toBe('/ha-ingress-entry');
	});

	it('preserves the query string and hash when stripping the prefix', () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(
			reroute({
				url: new URL(
					'https://homeassistant.local/api/hassio_ingress/abc123/reset-password?token=xyz#section'
				)
			})
		).toBe('/reset-password?token=xyz#section');
	});

	it('leaves a URL outside the Ingress prefix unchanged', () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(
			reroute({ url: new URL('https://homeassistant.local/some-other-path') })
		).toBeUndefined();
	});
});
