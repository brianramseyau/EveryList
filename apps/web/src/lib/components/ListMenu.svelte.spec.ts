import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ListDto } from '@everylist/shared';
import ListMenu from './ListMenu.svelte';

const list: ListDto = {
	id: 42,
	name: 'Groceries',
	color: '#3b82f6',
	icon: 'basket',
	ownerId: 1,
	archived: false,
	itemCount: 0,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null,
	version: 1
};

function open() {
	return page.getByRole('button', { name: 'List settings' }).click();
}

describe('ListMenu.svelte', () => {
	it('hides the menu links until the cog is opened', async () => {
		render(ListMenu, { listId: 1, list: null, onupdate: vi.fn(), ondelete: vi.fn() });

		await expect.element(page.getByRole('link', { name: 'Categories' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Members' })).not.toBeInTheDocument();
	});

	it("opens to reveal links to the list's categories and members, scoped to its id", async () => {
		render(ListMenu, { listId: 42, list: null, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();

		const categories = page.getByRole('link', { name: 'Categories' });
		await expect.element(categories).toBeInTheDocument();
		expect(categories.element().getAttribute('href')).toBe('/lists/42/categories');

		const members = page.getByRole('link', { name: 'Members' });
		await expect.element(members).toBeInTheDocument();
		expect(members.element().getAttribute('href')).toBe('/lists/42/members');
	});

	it('closes again on a second click of the cog', async () => {
		render(ListMenu, { listId: 1, list: null, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();
		await expect.element(page.getByRole('link', { name: 'Categories' })).toBeInTheDocument();

		await open();
		await expect.element(page.getByRole('link', { name: 'Categories' })).not.toBeInTheDocument();
	});

	it('does not show list settings (rename/icon/color/archive/delete) while the list has not loaded', async () => {
		render(ListMenu, { listId: 1, list: null, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();

		await expect
			.element(page.getByRole('button', { name: 'Archive list' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Delete list' })).not.toBeInTheDocument();
	});

	it('renames the list via the save button, but only when the name actually changed', async () => {
		const onupdate = vi.fn().mockResolvedValue(undefined);
		render(ListMenu, { listId: 42, list, onupdate, ondelete: vi.fn() });

		await open();

		const saveButton = page.getByRole('button', { name: 'Save name' });
		await expect.element(saveButton).toBeDisabled();

		await page.getByRole('textbox').fill('Weekly Groceries');
		await saveButton.click();

		expect(onupdate).toHaveBeenCalledWith({ name: 'Weekly Groceries' });
	});

	it('does not save when the name is only whitespace or unchanged', async () => {
		// The Save button is disabled in both cases, but saveName carries its
		// own guard, reachable via a raw 'submit' event and not just a click.
		const onupdate = vi.fn().mockResolvedValue(undefined);
		render(ListMenu, { listId: 42, list, onupdate, ondelete: vi.fn() });

		await open();

		const input = page.getByRole('textbox');
		const form = input.element().closest('form');

		await input.fill('   ');
		form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
		expect(onupdate).not.toHaveBeenCalled();

		await input.fill(list.name);
		form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
		expect(onupdate).not.toHaveBeenCalled();
	});

	it('changes the icon and color immediately on selection', async () => {
		const onupdate = vi.fn().mockResolvedValue(undefined);
		render(ListMenu, { listId: 42, list, onupdate, ondelete: vi.fn() });

		await open();

		await page.getByRole('button', { name: 'Basket' }).click();
		await page.getByPlaceholder('Search icons…').fill('cherries');
		await page.getByRole('button', { name: 'Fruit Cherries', exact: true }).click();
		expect(onupdate).toHaveBeenCalledWith({ icon: 'fruitCherries' });

		await page.getByRole('button', { name: 'Color' }).click();
		await page.getByRole('button', { name: '#ef4444' }).click();
		expect(onupdate).toHaveBeenCalledWith({ color: '#ef4444' });
	});

	it('toggles archived immediately, flipping the button label', async () => {
		const onupdate = vi.fn().mockResolvedValue(undefined);
		render(ListMenu, { listId: 42, list, onupdate, ondelete: vi.fn() });

		await open();

		await page.getByRole('button', { name: 'Archive list' }).click();
		expect(onupdate).toHaveBeenCalledWith({ archived: true });
	});

	it('shows "Unarchive list" for an archived list', async () => {
		render(ListMenu, {
			listId: 42,
			list: { ...list, archived: true },
			onupdate: vi.fn(),
			ondelete: vi.fn()
		});

		await open();

		await expect.element(page.getByRole('button', { name: 'Unarchive list' })).toBeInTheDocument();
	});

	it('requires a confirmation click before deleting the list', async () => {
		const ondelete = vi.fn().mockResolvedValue(undefined);
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete });

		await open();

		await page.getByRole('button', { name: 'Delete list' }).click();
		await expect
			.element(page.getByText('Delete "Groceries"? This can\'t be undone.'))
			.toBeInTheDocument();
		expect(ondelete).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Confirm delete' }).click();
		expect(ondelete).toHaveBeenCalled();
	});

	it('cancels the delete confirmation without deleting', async () => {
		const ondelete = vi.fn().mockResolvedValue(undefined);
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete });

		await open();
		await page.getByRole('button', { name: 'Delete list' }).click();
		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByRole('button', { name: 'Delete list' })).toBeInTheDocument();
		expect(ondelete).not.toHaveBeenCalled();
	});

	it('resets the delete confirmation and the name draft when reopened', async () => {
		const onupdate = vi.fn().mockResolvedValue(undefined);
		render(ListMenu, { listId: 42, list, onupdate, ondelete: vi.fn() });

		await open();
		await page.getByRole('textbox').fill('Something else');
		await page.getByRole('button', { name: 'Delete list' }).click();
		await open(); // close
		await open(); // reopen

		await expect.element(page.getByRole('button', { name: 'Delete list' })).toBeInTheDocument();
		await expect.element(page.getByRole('textbox')).toHaveValue('Groceries');
	});
});
