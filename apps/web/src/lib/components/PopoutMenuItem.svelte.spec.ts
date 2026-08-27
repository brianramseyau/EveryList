import { createRawSnippet } from 'svelte';
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PopoutMenuItem from './PopoutMenuItem.svelte';

const label = createRawSnippet(() => ({ render: () => `<span>Settings</span>` }));

describe('PopoutMenuItem.svelte', () => {
	it('renders as a link and still fires onclick when href is given', async () => {
		const onclick = vi.fn();
		render(PopoutMenuItem, { href: '/lists/1/settings', onclick, children: label });

		const link = page.getByRole('link', { name: 'Settings' }).element();
		// Same capture-phase guard as PageHeader.svelte.spec.ts's back-link
		// test — this is a real same-origin <a href>, and SvelteKit's own
		// document-level router (live in this test environment) would
		// otherwise navigate the iframe away, risking flakiness in other
		// concurrently running test files.
		const preventNav = (event: Event) => event.preventDefault();
		document.addEventListener('click', preventNav, { capture: true });
		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		document.removeEventListener('click', preventNav, { capture: true });

		expect(onclick).toHaveBeenCalledOnce();
	});

	it('renders as a button and calls onclick when no href is given', async () => {
		const onclick = vi.fn();
		render(PopoutMenuItem, { onclick, children: label });

		await page.getByRole('button', { name: 'Settings' }).click();

		expect(onclick).toHaveBeenCalledOnce();
	});

	it('disables the button when disabled is set', async () => {
		render(PopoutMenuItem, { disabled: true, children: label });

		await expect.element(page.getByRole('button', { name: 'Settings' })).toBeDisabled();
	});
});
