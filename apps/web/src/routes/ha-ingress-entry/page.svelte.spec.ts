import { describe, expect, it } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { load } from './+page';

describe('ha-ingress-entry/+page.ts load', () => {
	it('always redirects to /', () => {
		try {
			load();
			expect.unreachable('load() should have redirected');
		} catch (error) {
			if (!isRedirect(error)) throw error;
			expect(error.status).toBe(307);
			expect(error.location).toBe('/');
		}
	});
});
