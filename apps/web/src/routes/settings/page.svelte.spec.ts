import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SettingsPage from './+page.svelte';

describe('Settings +page.svelte', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('shows build metadata once /api/v1/meta resolves', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						version: 'v1.2.3',
						commit: 'abc123',
						builtAt: '2026-08-12T00:00:00.000Z'
					})
			})
		);

		render(SettingsPage);

		await expect.element(page.getByText(/EveryList v1\.2\.3 \(abc123\)/)).toBeInTheDocument();
	});

	it('shows a fallback message when the request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

		render(SettingsPage);

		await expect.element(page.getByText('EveryList — build info unavailable')).toBeInTheDocument();
	});
});
