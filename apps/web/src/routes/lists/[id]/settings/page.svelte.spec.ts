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
	deleteList: vi.fn()
}));
vi.mock('$lib/api/folders', () => ({ fetchFolders: vi.fn() }));
vi.mock('$lib/pwa/badge', () => ({ refreshBadgeCount: vi.fn() }));

const { fetchList, updateList, deleteList } = await import('$lib/api/lists');
const { fetchFolders } = await import('$lib/api/folders');
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
		vi.mocked(fetchFolders).mockResolvedValue([]);
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

	it('sets the document title to the loading fallback before the list resolves, then to the list name', async () => {
		let resolveFetch!: (value: typeof list) => void;
		vi.mocked(fetchList).mockReturnValue(
			new Promise((resolve) => {
				resolveFetch = resolve;
			})
		);

		render(SettingsPage);

		expect(document.title).toBe('List settings — EveryList');

		resolveFetch(list);

		await expect.poll(() => document.title).toBe('Groceries — Settings — EveryList');
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

	it('disables Save until something actually changes, then saves name/icon/color/folder together', async () => {
		vi.mocked(updateList).mockResolvedValue({ ...list, name: 'Weekly Groceries' });

		render(SettingsPage);
		await expect.element(page.getByRole('textbox').first()).toHaveValue('Groceries');

		const saveButton = page.getByRole('button', { name: 'Save changes' });
		await expect.element(saveButton).toBeDisabled();

		await page.getByRole('textbox').first().fill('Weekly Groceries');
		await expect.element(saveButton).not.toBeDisabled();
		await saveButton.click();

		expect(updateList).toHaveBeenCalledWith(1, {
			name: 'Weekly Groceries',
			icon: 'basket',
			color: '#3b82f6',
			folderId: null
		});
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

	it('stages icon and color changes locally until Save is clicked', async () => {
		vi.mocked(updateList).mockResolvedValue({ ...list, icon: 'fruitCherries', color: '#ef4444' });

		render(SettingsPage);
		await expect.element(page.getByRole('button', { name: 'Basket' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Basket' }).click();
		await page.getByPlaceholder('Search icons…').fill('cherries');
		await page.getByRole('button', { name: 'Fruit Cherries', exact: true }).click();
		expect(updateList).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Color' }).click();
		await page.getByRole('button', { name: '#ef4444' }).click();
		expect(updateList).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Save changes' }).click();
		expect(updateList).toHaveBeenCalledWith(1, {
			name: 'Groceries',
			icon: 'fruitCherries',
			color: '#ef4444',
			folderId: null
		});
	});

	it('hides the folder selector when the account has no folders', async () => {
		render(SettingsPage);
		await expect.element(page.getByRole('button', { name: 'Archive list' })).toBeInTheDocument();

		await expect.element(page.getByRole('combobox')).not.toBeInTheDocument();
	});

	it('stages a folder change locally until Save is clicked', async () => {
		const folder = {
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			createdAt: TS,
			updatedAt: null,
			version: 1
		};
		vi.mocked(fetchFolders).mockResolvedValue([folder]);
		vi.mocked(updateList).mockResolvedValue({ ...list, folderId: 5 });

		render(SettingsPage);
		await expect.element(page.getByRole('combobox')).toBeInTheDocument();

		await page.getByRole('combobox').selectOptions('5');
		expect(updateList).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Save changes' }).click();
		expect(updateList).toHaveBeenCalledWith(1, {
			name: 'Groceries',
			icon: 'basket',
			color: '#3b82f6',
			folderId: 5
		});
	});

	it('stages clearing the folder locally until Save is clicked', async () => {
		const folder = {
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			createdAt: TS,
			updatedAt: null,
			version: 1
		};
		vi.mocked(fetchList).mockResolvedValue({ ...list, folderId: 5 });
		vi.mocked(fetchFolders).mockResolvedValue([folder]);
		vi.mocked(updateList).mockResolvedValue({ ...list, folderId: null });

		render(SettingsPage);
		await expect.element(page.getByRole('combobox')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Close' }).click();
		expect(updateList).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Save changes' }).click();
		expect(updateList).toHaveBeenCalledWith(1, {
			name: 'Groceries',
			icon: 'basket',
			color: '#3b82f6',
			folderId: null
		});
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

	it('disables categories, flipping the button label and hiding the Categories link', async () => {
		vi.mocked(updateList).mockResolvedValue({ ...list, useCategories: false });

		render(SettingsPage);
		await expect
			.element(page.getByRole('button', { name: 'Disable categories' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Disable categories' }).click();

		expect(updateList).toHaveBeenCalledWith(1, { useCategories: false });
		await expect
			.element(page.getByRole('button', { name: 'Enable categories' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Categories' })).not.toBeInTheDocument();
	});

	it('re-enables categories from a list that had them disabled', async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, useCategories: false });
		vi.mocked(updateList).mockResolvedValue({ ...list, useCategories: true });

		render(SettingsPage);
		await expect
			.element(page.getByRole('button', { name: 'Enable categories' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Enable categories' }).click();

		expect(updateList).toHaveBeenCalledWith(1, { useCategories: true });
		await expect
			.element(page.getByRole('button', { name: 'Disable categories' }))
			.toBeInTheDocument();
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
