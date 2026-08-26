import { createRawSnippet } from 'svelte';
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { consumeNavDirection } from '$lib/nav-direction';
import PageHeader from './PageHeader.svelte';

const extraContent = createRawSnippet(() => ({
	render: () => `<p>Extra content</p>`
}));

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

	it('derives the document title from `title` plus the app suffix by default', async () => {
		render(PageHeader, { title: 'My Lists' });

		await expect.element(page.getByRole('heading', { name: 'My Lists' })).toBeInTheDocument();
		expect(document.title).toBe('My Lists — EveryList');
	});

	it('uses `htmlTitle` verbatim for the document title when given, ignoring `title`', async () => {
		render(PageHeader, { title: 'Edit Favorite', htmlTitle: 'Milk' });

		await expect.element(page.getByRole('heading', { name: 'Edit Favorite' })).toBeInTheDocument();
		expect(document.title).toBe('Milk — EveryList');
	});

	it('falls back to the bare app name when neither `title` nor `htmlTitle` is given', async () => {
		render(PageHeader, { backHref: '/lists' });

		await expect.poll(() => document.title).toBe('EveryList');
	});

	it('updates the document title in place as `title` changes on an already-mounted instance', async () => {
		const { rerender } = render(PageHeader, { title: 'List' });
		expect(document.title).toBe('List — EveryList');

		await rerender({ title: 'Groceries' });
		expect(document.title).toBe('Groceries — EveryList');
	});

	it('renders no fixed wrapper by default, ignoring `extra`', async () => {
		render(PageHeader, { title: 'My Lists', extra: extraContent });

		const heading = page.getByRole('heading', { name: 'My Lists' }).element();
		expect(heading.closest('div.fixed')).toBeNull();
		expect(page.getByText('Extra content').elements()).toHaveLength(0);
	});

	it('wraps the header and `extra` content in a fixed, height-measuring container when `fixed` is set', async () => {
		render(PageHeader, { title: 'List', fixed: true, extra: extraContent });

		const heading = page.getByRole('heading', { name: 'List' }).element();
		const wrapper = heading.closest('div.fixed');
		expect(wrapper).not.toBeNull();
		expect(wrapper?.getAttribute('style')).toContain('touch-action: pan-x pan-y');
		await expect.element(page.getByText('Extra content')).toBeInTheDocument();
	});

	it('sizes the fixed wrapper to the same centered max-w-lg column every page uses, not a shrink-to-fit width', async () => {
		// A `position: fixed` box with no explicit width shrinks to fit its
		// content instead of matching the page's own centered column — which
		// left scrolled list rows' right-hand edge (delete/edit buttons)
		// uncovered by this header on lists/[id], visible bleeding through on
		// scroll. inset-x-0 + mx-auto + max-w-lg + px-4 replicates the exact
		// box every page's own <main> computes, independent of DOM position.
		render(PageHeader, { title: 'List', fixed: true });

		const heading = page.getByRole('heading', { name: 'List' }).element();
		const wrapper = heading.closest('div.fixed') as HTMLElement;
		expect(wrapper.className).toContain('inset-x-0');
		expect(wrapper.className).toContain('mx-auto');
		expect(wrapper.className).toContain('max-w-lg');
		expect(wrapper.className).toContain('px-4');
	});

	it('binds a positive `height` once the fixed wrapper mounts', async () => {
		let height = 0;
		render(PageHeader, {
			title: 'List',
			fixed: true,
			get height() {
				return height;
			},
			set height(value: number) {
				height = value;
			}
		});

		await expect.element(page.getByRole('heading', { name: 'List' })).toBeInTheDocument();
		// bind:clientHeight resolves on a resize-observer tick, not
		// synchronously with mount — poll briefly rather than assert
		// immediately.
		await expect.poll(() => height).toBeGreaterThan(0);
	});
});
