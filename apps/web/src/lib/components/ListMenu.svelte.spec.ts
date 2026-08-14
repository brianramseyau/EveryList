import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ListMenu from './ListMenu.svelte';

describe('ListMenu.svelte', () => {
	it('hides the menu links until the cog is opened', async () => {
		render(ListMenu, { listId: 1 });

		await expect.element(page.getByRole('link', { name: 'Categories' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Members' })).not.toBeInTheDocument();
	});

	it("opens to reveal links to the list's categories and members, scoped to its id", async () => {
		render(ListMenu, { listId: 42 });

		await page.getByRole('button', { name: 'List settings' }).click();

		const categories = page.getByRole('link', { name: 'Categories' });
		await expect.element(categories).toBeInTheDocument();
		expect(categories.element().getAttribute('href')).toBe('/lists/42/categories');

		const members = page.getByRole('link', { name: 'Members' });
		await expect.element(members).toBeInTheDocument();
		expect(members.element().getAttribute('href')).toBe('/lists/42/members');
	});

	it('closes again on a second click of the cog', async () => {
		render(ListMenu, { listId: 1 });

		await page.getByRole('button', { name: 'List settings' }).click();
		await expect.element(page.getByRole('link', { name: 'Categories' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'List settings' }).click();
		await expect.element(page.getByRole('link', { name: 'Categories' })).not.toBeInTheDocument();
	});
});
