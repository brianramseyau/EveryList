import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Loader from './Loader.svelte';

describe('Loader.svelte', () => {
	it('shows "Loading…" by default, in a status region', async () => {
		render(Loader);

		await expect.element(page.getByRole('status')).toBeInTheDocument();
		await expect.element(page.getByText('Loading…')).toBeInTheDocument();
	});

	it('shows a custom label', async () => {
		render(Loader, { label: 'Loading icons…' });

		await expect.element(page.getByText('Loading icons…')).toBeInTheDocument();
	});

	it('sizes the checkbox glyphs down in compact mode', async () => {
		const { container } = render(Loader, { compact: true });

		expect(container.querySelector('.loader-box')?.className).toContain('h-3.5');
	});

	it('uses the default (non-compact) glyph size otherwise', async () => {
		const { container } = render(Loader);

		expect(container.querySelector('.loader-box')?.className).toContain('h-5');
	});
});
