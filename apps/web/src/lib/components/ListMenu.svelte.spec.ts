import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ListDto } from '@everylist/shared';
import { ApiError } from '$lib/api/client';

vi.mock('$lib/api/lists', () => ({ emailExportList: vi.fn() }));

const { emailExportList } = await import('$lib/api/lists');
const ListMenu = (await import('./ListMenu.svelte')).default;

const list: ListDto = {
	id: 42,
	name: 'Groceries',
	color: '#3b82f6',
	icon: 'basket',
	ownerId: 1,
	folderId: null,
	badgeExcluded: false,
	passcodeHash: null,
	archived: false,
	itemCount: 0,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null,
	version: 1
};

function open() {
	return page.getByRole('button', { name: 'List settings' }).click();
}

afterEach(() => {
	vi.clearAllMocks();
});

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

	it('closes the icon picker when the color picker is opened, and vice versa', async () => {
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();

		await page.getByRole('button', { name: 'Basket' }).click();
		await expect.element(page.getByPlaceholder('Search icons…')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Color' }).click();
		await expect.element(page.getByPlaceholder('Search icons…')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: '#ef4444' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Basket' }).click();
		await expect.element(page.getByRole('button', { name: '#ef4444' })).not.toBeInTheDocument();
		await expect.element(page.getByPlaceholder('Search icons…')).toBeInTheDocument();
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

	it('toggles badge exclusion immediately, flipping the button label', async () => {
		const onupdate = vi.fn().mockResolvedValue(undefined);
		render(ListMenu, { listId: 42, list, onupdate, ondelete: vi.fn() });

		await open();

		await page.getByRole('button', { name: 'Exclude from badge count' }).click();
		expect(onupdate).toHaveBeenCalledWith({ badgeExcluded: true });
	});

	it('shows "Include in badge count" for a badge-excluded list', async () => {
		render(ListMenu, {
			listId: 42,
			list: { ...list, badgeExcluded: true },
			onupdate: vi.fn(),
			ondelete: vi.fn()
		});

		await open();

		await expect
			.element(page.getByRole('button', { name: 'Include in badge count' }))
			.toBeInTheDocument();
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

	it('prints the list via window.print', async () => {
		const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();
		await page.getByRole('button', { name: 'Print list' }).click();

		expect(printSpy).toHaveBeenCalled();
		printSpy.mockRestore();
	});

	it('sends an email export and shows a success message', async () => {
		vi.mocked(emailExportList).mockResolvedValue(undefined);
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();
		await page.getByRole('button', { name: 'Email export…' }).click();
		await page.getByPlaceholder('you@example.com').fill('friend@example.com');
		await page.getByRole('button', { name: 'Send' }).click();

		expect(emailExportList).toHaveBeenCalledWith(42, 'friend@example.com');
		await expect.element(page.getByText('Export sent.')).toBeInTheDocument();
		await expect.element(page.getByPlaceholder('you@example.com')).toHaveValue('');
	});

	it('shows the ApiError message when the email export fails', async () => {
		vi.mocked(emailExportList).mockRejectedValue(
			new ApiError(503, 'Email export is not configured on this server.')
		);
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();
		await page.getByRole('button', { name: 'Email export…' }).click();
		await page.getByPlaceholder('you@example.com').fill('friend@example.com');
		await page.getByRole('button', { name: 'Send' }).click();

		await expect
			.element(page.getByText('Email export is not configured on this server.'))
			.toBeInTheDocument();
	});

	it('shows a generic error message when the email export fails without an ApiError', async () => {
		vi.mocked(emailExportList).mockRejectedValue(new Error('network down'));
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();
		await page.getByRole('button', { name: 'Email export…' }).click();
		await page.getByPlaceholder('you@example.com').fill('friend@example.com');
		await page.getByRole('button', { name: 'Send' }).click();

		await expect.element(page.getByText('Failed to send export.')).toBeInTheDocument();
	});

	it('does not submit the email export form with only whitespace', async () => {
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();
		await page.getByRole('button', { name: 'Email export…' }).click();

		const input = page.getByPlaceholder('you@example.com');
		const form = input.element().closest('form');
		await input.fill('   ');
		form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		expect(emailExportList).not.toHaveBeenCalled();
	});

	it('cancels the email export form', async () => {
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();
		await page.getByRole('button', { name: 'Email export…' }).click();
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();

		await expect.element(page.getByRole('button', { name: 'Email export…' })).toBeInTheDocument();
	});

	it('resets the email export form when reopened', async () => {
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();
		await page.getByRole('button', { name: 'Email export…' }).click();
		await open(); // close
		await open(); // reopen

		await expect.element(page.getByRole('button', { name: 'Email export…' })).toBeInTheDocument();
	});

	it('sets a passcode with a client-computed hash, hiding the raw PIN from onupdate', async () => {
		const onupdate = vi.fn().mockResolvedValue(undefined);
		render(ListMenu, { listId: 42, list, onupdate, ondelete: vi.fn() });

		await open();
		await expect
			.element(page.getByRole('button', { name: 'Remove passcode' }))
			.not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Set passcode…' }).click();
		await page.getByPlaceholder('New passcode').fill('1234');
		await page.getByRole('button', { name: 'Save passcode' }).click();

		expect(onupdate).toHaveBeenCalledTimes(1);
		const call = onupdate.mock.calls[0]![0] as { passcodeHash: string };
		expect(call.passcodeHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
		await expect.element(page.getByRole('button', { name: 'Set passcode…' })).toBeInTheDocument();
	});

	it('offers "Change passcode…" and "Remove passcode" once a passcode is set', async () => {
		const onupdate = vi.fn().mockResolvedValue(undefined);
		render(ListMenu, {
			listId: 42,
			list: { ...list, passcodeHash: 'salt:hash' },
			onupdate,
			ondelete: vi.fn()
		});

		await open();
		await expect
			.element(page.getByRole('button', { name: 'Change passcode…' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Change passcode…' }).click();
		await expect.element(page.getByText('Change passcode')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();

		await page.getByRole('button', { name: 'Remove passcode' }).click();
		expect(onupdate).toHaveBeenCalledWith({ passcodeHash: null });
	});

	it('cancels the passcode form without saving', async () => {
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();
		await page.getByRole('button', { name: 'Set passcode…' }).click();
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();

		await expect.element(page.getByRole('button', { name: 'Set passcode…' })).toBeInTheDocument();
	});

	it('does not save the passcode form with only whitespace', async () => {
		const onupdate = vi.fn().mockResolvedValue(undefined);
		render(ListMenu, { listId: 42, list, onupdate, ondelete: vi.fn() });

		await open();
		await page.getByRole('button', { name: 'Set passcode…' }).click();

		const saveButton = page.getByRole('button', { name: 'Save passcode' });
		await expect.element(saveButton).toBeDisabled();

		const input = page.getByPlaceholder('New passcode');
		const form = input.element().closest('form');
		await input.fill('   ');
		form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		expect(onupdate).not.toHaveBeenCalled();
	});

	it('resets the passcode form when reopened', async () => {
		render(ListMenu, { listId: 42, list, onupdate: vi.fn(), ondelete: vi.fn() });

		await open();
		await page.getByRole('button', { name: 'Set passcode…' }).click();
		await open(); // close
		await open(); // reopen

		await expect.element(page.getByRole('button', { name: 'Set passcode…' })).toBeInTheDocument();
	});
});
