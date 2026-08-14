import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PageHeader from './PageHeader.svelte';

describe('PageHeader.svelte', () => {
	it('renders a title with no back link or actions by default', async () => {
		render(PageHeader, { title: 'My Lists' });

		await expect.element(page.getByRole('heading', { name: 'My Lists' })).toBeInTheDocument();
		expect(page.getByText('← Back').elements()).toHaveLength(0);
	});

	it('renders a back link with a custom label when backHref is given', async () => {
		render(PageHeader, { title: 'Categories', backHref: '/lists/1', backLabel: 'Back to list' });

		await expect.element(page.getByRole('link', { name: '← Back to list' })).toBeInTheDocument();
	});

	it('omits the title row entirely when no title is given', async () => {
		render(PageHeader, { backHref: '/lists' });

		expect(page.getByRole('heading').elements()).toHaveLength(0);
		await expect.element(page.getByRole('link', { name: '← Back' })).toBeInTheDocument();
	});
});
