import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { isRedirect } from '@sveltejs/kit';
import { setToken, clearToken } from '$lib/api/token';

vi.mock('$lib/api/setup', () => ({ fetchSetupStatus: vi.fn() }));

const { fetchSetupStatus } = await import('$lib/api/setup');
const { load } = await import('./+page');
const HomePage = (await import('./+page.svelte')).default;

const notNeeded = {
	needsSetup: false,
	defaultBackupSettings: { frequency: 'weekly' as const, timeOfDay: '03:00', retentionCount: 4 }
};

describe('Home +page.svelte', () => {
	afterEach(() => {
		clearToken();
	});

	it('shows a login link once mounted', async () => {
		render(HomePage);

		await expect.element(page.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
	});

	// The `mounted` flag itself (false until onMount, which prerendering never runs — see +page.ts)
	// isn't observable from this browser-based component test: vitest-browser-svelte's `render`
	// runs onMount synchronously as part of mounting, before this test ever gets a look at the
	// pre-mount DOM. Covered instead by the live build/Playwright verification in the PR — a real
	// prerendered `index.html` never contains the splash markup, only this loading placeholder.
});

describe('Home +page.ts load', () => {
	afterEach(() => {
		clearToken();
		delete window.__EVERYLIST_INGRESS_BASE__;
		vi.clearAllMocks();
	});

	it('does not redirect when signed out and setup is already done', async () => {
		vi.mocked(fetchSetupStatus).mockResolvedValue(notNeeded);

		await expect(load()).resolves.toBeUndefined();
	});

	it('does not redirect when the setup status fetch fails (fails open)', async () => {
		vi.mocked(fetchSetupStatus).mockRejectedValue(new Error('network down'));

		await expect(load()).resolves.toBeUndefined();
	});

	it('redirects to /setup when a fresh instance needs setup, before the splash paints', async () => {
		vi.mocked(fetchSetupStatus).mockResolvedValue({ ...notNeeded, needsSetup: true });

		try {
			await load();
			expect.unreachable('load() should have redirected');
		} catch (error) {
			if (!isRedirect(error)) throw error;
			expect(error.status).toBe(307);
			expect(error.location).toBe('/setup');
		}
	});

	it('redirects to /setup within the Ingress prefix when setup is needed', async () => {
		vi.mocked(fetchSetupStatus).mockResolvedValue({ ...notNeeded, needsSetup: true });
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';

		try {
			await load();
			expect.unreachable('load() should have redirected');
		} catch (error) {
			if (!isRedirect(error)) throw error;
			expect(error.status).toBe(307);
			expect(error.location).toBe('/api/hassio_ingress/abc123/setup');
		}
	});

	it('redirects to /lists when signed in, without checking setup status', async () => {
		setToken('test-token');

		try {
			await load();
			expect.unreachable('load() should have redirected');
		} catch (error) {
			if (!isRedirect(error)) throw error;
			expect(error.status).toBe(307);
			expect(error.location).toBe('/lists');
		}
		expect(fetchSetupStatus).not.toHaveBeenCalled();
	});

	it('redirects to /lists within the Ingress prefix, not the bare origin root', async () => {
		setToken('test-token');
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';

		try {
			await load();
			expect.unreachable('load() should have redirected');
		} catch (error) {
			if (!isRedirect(error)) throw error;
			expect(error.status).toBe(307);
			expect(error.location).toBe('/api/hassio_ingress/abc123/lists');
		}
	});
});
