import { afterEach, describe, expect, it } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { load } from './+page';

describe('ha-ingress-entry/+page.ts load', () => {
	afterEach(() => {
		delete window.__EVERYLIST_INGRESS_BASE__;
	});

	it('redirects to / outside ingress', () => {
		try {
			load();
			expect.unreachable('load() should have redirected');
		} catch (error) {
			if (!isRedirect(error)) throw error;
			expect(error.status).toBe(307);
			expect(error.location).toBe('/');
		}
	});

	it('redirects to / within the ingress prefix, not the bare origin root', () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		try {
			load();
			expect.unreachable('load() should have redirected');
		} catch (error) {
			if (!isRedirect(error)) throw error;
			expect(error.status).toBe(307);
			expect(error.location).toBe('/api/hassio_ingress/abc123/');
		}
	});
});
