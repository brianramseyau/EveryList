import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({
	fetchList: vi.fn(),
	updateList: vi.fn(),
	deleteList: vi.fn(),
	emailExportList: vi.fn()
}));
vi.mock('$lib/pwa/badge', () => ({ refreshBadgeCount: vi.fn() }));

const { fetchList, updateList, deleteList, emailExportList } = await import('$lib/api/lists');
const { refreshBadgeCount } = await import('$lib/pwa/badge');
const { goto } = await import('$app/navigation');
const SettingsPage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

const list = {
	id: 1,
	name: 'Groceries',
	color: '#3b82f6',
	icon: 'basket',
	ownerId: 1,
	folderId: null,
	badgeExcluded: false,
	passcodeHash: null,
	archived: false,
	itemCount: 0,
	createdAt: TS,
	updatedAt: null,
	version: 1
};

describe('List settings +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(SettingsPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/login');
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchList).mockRejectedValue(new TypeError('network down'));

		render(SettingsPage);

		await expect.element(page.getByText('Failed to load list settings.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchList).mockRejectedValue(new ApiError(500, 'List not found'));

		render(SettingsPage);

		await expect.element(page.getByText('List not found')).toBeInTheDocument();
	});

	it("links to the list's categories and members, scoped to its id", async () => {
		render(SettingsPage);

		const categories = page.getByRole('link', { name: 'Categories' });
		await expect.element(categories).toBeInTheDocument();
		expect(categories.element().getAttribute('href')).toBe('/lists/1/categories');

		const members = page.getByRole('link', { name: 'Members' });
		await expect.element(members).toBeInTheDocument();
		expect(members.element().getAttribute('href')).toBe('/lists/1/members');
	});

	it('hides the Categories link when the list opts out of categories', async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, useCategories: false });

		render(SettingsPage);
		await expect.element(page.getByRole('link', { name: 'Members' })).toBeInTheDocument();

		await expect.element(page.getByRole('link', { name: 'Categories' })).not.toBeInTheDocument();
	});

	it('renames the list via the save button, but only when the name actually changed', async () => {
		vi.mocked(updateList).mockResolvedValue({ ...list, name: 'Weekly Groceries' });

		render(SettingsPage);
		await expect.element(page.getByRole('textbox').first()).toHaveValue('Groceries');

		const saveButton = page.getByRole('button', { name: 'Save name' });
		await expect.element(saveButton).toBeDisabled();

		await page.getByRole('textbox').first().fill('Weekly Groceries');
		await saveButton.click();

		expect(updateList).toHaveBeenCalledWith(1, { name: 'Weekly Groceries' });
	});

	it('does not save when the name is only whitespace or unchanged', async () => {
		render(SettingsPage);

		const input = page.getByRole('textbox').first();
		await expect.element(input).toHaveValue('Groceries');
		const form = input.element().closest('form');

		await input.fill('   ');
		form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
		expect(updateList).not.toHaveBeenCalled();

		await input.fill(list.name);
		form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
		expect(updateList).not.toHaveBeenCalled();
	});

	it('changes the icon and color immediately on selection', async () => {
		vi.mocked(updateList).mockResolvedValue({ ...list, icon: 'fruitCherries' });

		render(SettingsPage);
		await expect.element(page.getByRole('button', { name: 'Basket' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Basket' }).click();
		await page.getByPlaceholder('Search icons…').fill('cherries');
		await page.getByRole('button', { name: 'Fruit Cherries', exact: true }).click();
		expect(updateList).toHaveBeenCalledWith(1, { icon: 'fruitCherries' });

		await page.getByRole('button', { name: 'Color' }).click();
		await page.getByRole('button', { name: '#ef4444' }).click();
		expect(updateList).toHaveBeenCalledWith(1, { color: '#ef4444' });
	});

	it('archives the list, flipping the button label', async () => {
		vi.mocked(updateList).mockResolvedValue({ ...list, archived: true });

		render(SettingsPage);
		await expect.element(page.getByRole('button', { name: 'Archive list' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Archive list' }).click();

		expect(updateList).toHaveBeenCalledWith(1, { archived: true });
		await expect.element(page.getByRole('button', { name: 'Unarchive list' })).toBeInTheDocument();
		expect(refreshBadgeCount).toHaveBeenCalled();
	});

	it('excludes the list from the badge count, flipping the button label', async () => {
		vi.mocked(updateList).mockResolvedValue({ ...list, badgeExcluded: true });

		render(SettingsPage);
		await expect
			.element(page.getByRole('button', { name: 'Exclude from badge count' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Exclude from badge count' }).click();

		expect(updateList).toHaveBeenCalledWith(1, { badgeExcluded: true });
		await expect
			.element(page.getByRole('button', { name: 'Include in badge count' }))
			.toBeInTheDocument();
		expect(refreshBadgeCount).toHaveBeenCalled();
	});

	it('shows an error when updating the list fails', async () => {
		vi.mocked(updateList).mockRejectedValue(new ApiError(500, 'Could not update list'));

		render(SettingsPage);
		await expect.element(page.getByRole('button', { name: 'Archive list' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Archive list' }).click();

		await expect.element(page.getByText('Could not update list')).toBeInTheDocument();
	});

	it('shows a generic error message when updating the list fails without an ApiError', async () => {
		vi.mocked(updateList).mockRejectedValue(new TypeError('network down'));

		render(SettingsPage);
		await page.getByRole('button', { name: 'Archive list' }).click();

		await expect.element(page.getByText('Failed to update list.')).toBeInTheDocument();
	});

	it('falls back to the default icon when the list has none', async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, icon: null });

		render(SettingsPage);

		await expect
			.element(page.getByRole('button', { name: 'Format List Checks' }))
			.toBeInTheDocument();
	});

	it('sets a passcode with a client-computed hash, hiding the raw PIN from the API call', async () => {
		vi.mocked(updateList).mockResolvedValue(list);

		render(SettingsPage);
		await expect.element(page.getByRole('button', { name: 'Set passcode…' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Set passcode…' }).click();
		await page.getByPlaceholder('New passcode').fill('1234');
		await page.getByRole('button', { name: 'Save passcode' }).click();

		expect(updateList).toHaveBeenCalledTimes(1);
		const call = vi.mocked(updateList).mock.calls[0]![1] as { passcodeHash: string };
		expect(call.passcodeHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
		await expect.element(page.getByRole('button', { name: 'Set passcode…' })).toBeInTheDocument();
	});

	it('offers "Remove passcode" once a passcode is set', async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, passcodeHash: 'salt:hash' });
		vi.mocked(updateList).mockResolvedValue({ ...list, passcodeHash: null });

		render(SettingsPage);
		await expect
			.element(page.getByRole('button', { name: 'Change passcode…' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove passcode' }).click();
		expect(updateList).toHaveBeenCalledWith(1, { passcodeHash: null });
	});

	it('opens the "Change passcode" form when a passcode is already set', async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, passcodeHash: 'salt:hash' });

		render(SettingsPage);
		await page.getByRole('button', { name: 'Change passcode…' }).click();

		await expect.element(page.getByText('Change passcode', { exact: true })).toBeInTheDocument();
	});

	it('does not save the passcode form with only whitespace', async () => {
		render(SettingsPage);
		await page.getByRole('button', { name: 'Set passcode…' }).click();

		const saveButton = page.getByRole('button', { name: 'Save passcode' });
		await expect.element(saveButton).toBeDisabled();

		const input = page.getByPlaceholder('New passcode');
		const form = input.element().closest('form');
		await input.fill('   ');
		form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		expect(updateList).not.toHaveBeenCalled();
	});

	it('cancels the passcode form without saving', async () => {
		render(SettingsPage);
		await page.getByRole('button', { name: 'Set passcode…' }).click();

		await page.getByRole('button', { name: 'Cancel', exact: true }).click();

		await expect.element(page.getByRole('button', { name: 'Set passcode…' })).toBeInTheDocument();
		expect(updateList).not.toHaveBeenCalled();
	});

	it('prints the list via window.print', async () => {
		const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
		render(SettingsPage);

		await page.getByRole('button', { name: 'Print list' }).click();

		expect(printSpy).toHaveBeenCalled();
		printSpy.mockRestore();
	});

	it('sends an email export and shows a success message', async () => {
		vi.mocked(emailExportList).mockResolvedValue(undefined);

		render(SettingsPage);
		await page.getByRole('button', { name: 'Email export…' }).click();
		await page.getByPlaceholder('you@example.com').fill('friend@example.com');
		await page.getByRole('button', { name: 'Send' }).click();

		expect(emailExportList).toHaveBeenCalledWith(1, 'friend@example.com');
		await expect.element(page.getByText('Export sent.')).toBeInTheDocument();
	});

	it('shows the ApiError message when the email export fails', async () => {
		vi.mocked(emailExportList).mockRejectedValue(
			new ApiError(503, 'Email export is not configured on this server.')
		);

		render(SettingsPage);
		await page.getByRole('button', { name: 'Email export…' }).click();
		await page.getByPlaceholder('you@example.com').fill('friend@example.com');
		await page.getByRole('button', { name: 'Send' }).click();

		await expect
			.element(page.getByText('Email export is not configured on this server.'))
			.toBeInTheDocument();
	});

	it('shows a generic error message when the email export fails without an ApiError', async () => {
		vi.mocked(emailExportList).mockRejectedValue(new TypeError('network down'));

		render(SettingsPage);
		await page.getByRole('button', { name: 'Email export…' }).click();
		await page.getByPlaceholder('you@example.com').fill('friend@example.com');
		await page.getByRole('button', { name: 'Send' }).click();

		await expect.element(page.getByText('Failed to send export.')).toBeInTheDocument();
	});

	it('does not submit the email export form with only whitespace', async () => {
		render(SettingsPage);
		await page.getByRole('button', { name: 'Email export…' }).click();

		const input = page.getByPlaceholder('you@example.com');
		const form = input.element().closest('form');
		await input.fill('   ');
		form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		expect(emailExportList).not.toHaveBeenCalled();
	});

	it('cancels the email export form', async () => {
		render(SettingsPage);
		await page.getByRole('button', { name: 'Email export…' }).click();

		await page.getByRole('button', { name: 'Cancel', exact: true }).click();

		await expect.element(page.getByRole('button', { name: 'Email export…' })).toBeInTheDocument();
		expect(emailExportList).not.toHaveBeenCalled();
	});

	it('requires a confirmation click before deleting the list, then navigates back to the list index', async () => {
		vi.mocked(deleteList).mockResolvedValue(undefined);

		render(SettingsPage);
		await page.getByRole('button', { name: 'Delete list' }).click();
		await expect
			.element(page.getByText('Delete "Groceries"? This can\'t be undone.'))
			.toBeInTheDocument();
		expect(deleteList).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Confirm delete' }).click();

		expect(deleteList).toHaveBeenCalledWith(1);
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/lists');
	});

	it('shows an error when deleting the list fails', async () => {
		vi.mocked(deleteList).mockRejectedValue(new ApiError(500, 'Could not delete list'));

		render(SettingsPage);
		await page.getByRole('button', { name: 'Delete list' }).click();
		await page.getByRole('button', { name: 'Confirm delete' }).click();

		await expect.element(page.getByText('Could not delete list')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalledWith('/lists');
	});

	it('shows a generic error message when deleting the list fails without an ApiError', async () => {
		vi.mocked(deleteList).mockRejectedValue(new TypeError('network down'));

		render(SettingsPage);
		await page.getByRole('button', { name: 'Delete list' }).click();
		await page.getByRole('button', { name: 'Confirm delete' }).click();

		await expect.element(page.getByText('Failed to delete list.')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalledWith('/lists');
	});

	it('cancels the delete confirmation without deleting', async () => {
		render(SettingsPage);
		await page.getByRole('button', { name: 'Delete list' }).click();
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();

		await expect.element(page.getByRole('button', { name: 'Delete list' })).toBeInTheDocument();
		expect(deleteList).not.toHaveBeenCalled();
	});
});
