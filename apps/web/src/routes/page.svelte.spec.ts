import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { isRedirect } from '@sveltejs/kit';
import { setToken, clearToken } from '$lib/api/token';
import { load } from './+page';
import HomePage from './+page.svelte';

describe('Home +page.svelte', () => {
	afterEach(() => {
		clearToken();
	});

	it('shows a login link', async () => {
		render(HomePage);

		await expect.element(page.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
	});
});

describe('Home +page.ts load', () => {
	afterEach(() => {
		clearToken();
		delete window.__EVERYLIST_INGRESS_BASE__;
	});

	it('does not redirect when signed out', () => {
		expect(() => load()).not.toThrow();
	});

	it('redirects to /lists when signed in', () => {
		setToken('test-token');

		try {
			load();
			expect.unreachable('load() should have redirected');
		} catch (error) {
			if (!isRedirect(error)) throw error;
			expect(error.status).toBe(307);
			expect(error.location).toBe('/lists');
		}
	});

	it('redirects to /lists within the Ingress prefix, not the bare origin root', () => {
		setToken('test-token');
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';

		try {
			load();
			expect.unreachable('load() should have redirected');
		} catch (error) {
			if (!isRedirect(error)) throw error;
			expect(error.status).toBe(307);
			expect(error.location).toBe('/api/hassio_ingress/abc123/lists');
		}
	});
});
