import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { consumeNavDirection } from '$lib/nav-direction';
import PageHeader from './PageHeader.svelte';

describe('PageHeader.svelte', () => {
	it('renders a title with no back link or actions by default', async () => {
		render(PageHeader, { title: 'My Lists' });

		await expect.element(page.getByRole('heading', { name: 'My Lists' })).toBeInTheDocument();
		expect(page.getByRole('link', { name: 'Back' }).elements()).toHaveLength(0);
	});

	it('renders an icon-only back link labelled with the custom backLabel when backHref is given', async () => {
		render(PageHeader, { title: 'Categories', backHref: '/lists/1', backLabel: 'Back to list' });

		const link = page.getByRole('link', { name: 'Back to list' });
		await expect.element(link).toBeInTheDocument();
		expect(link.element().textContent?.trim()).toBe('');
	});

	it('marks the navigation as "back" when the back link is activated, for the view-transition hook', async () => {
		render(PageHeader, { title: 'Categories', backHref: '/lists/1' });

		// This link is a real, attached <a href> in a real browser, and
		// Svelte 5 delegates click handling up to a document-level listener
		// (so onclick={markBackNavigation} needs a bubbling event to fire at
		// all) — which SvelteKit's own document-level router, live in this
		// test environment, would *also* see and intercept as a genuine
		// client-side navigation, sending this iframe off and risking
		// flakiness in other concurrently running test files against the
		// shared dev server. A capture-phase preventDefault on `document`
		// runs before either bubble-phase listener, so SvelteKit's router
		// (which itself skips already-prevented clicks) never navigates,
		// while Svelte's delegated onclick still fires normally.
		const link = page.getByRole('link', { name: 'Back' }).element();
		const preventNav = (event: Event) => event.preventDefault();
		document.addEventListener('click', preventNav, { capture: true });
		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		document.removeEventListener('click', preventNav, { capture: true });

		expect(consumeNavDirection(false)).toBe('back');
	});

	it('omits the title row entirely when no title is given, still rendering the back link', async () => {
		render(PageHeader, { backHref: '/lists' });

		expect(page.getByRole('heading').elements()).toHaveLength(0);
		await expect.element(page.getByRole('link', { name: 'Back' })).toBeInTheDocument();
	});
});
