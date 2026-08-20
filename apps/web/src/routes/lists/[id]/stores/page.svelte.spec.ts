import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';
import { getSelectedStoreSettings, setSelectedStoreSettings } from '$lib/api/selected-store';
import { resetDbForTesting } from '$lib/offline/db';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/stores', () => ({
	fetchStores: vi.fn(),
	detachStore: vi.fn(),
	updateStore: vi.fn()
}));

const { fetchList } = await import('$lib/api/lists');
const { fetchStores, detachStore, updateStore } = await import('$lib/api/stores');
const { goto } = await import('$app/navigation');
const StoresPage = (await import('./+page.svelte')).default;

const list = {
	id: 1,
	name: 'Groceries',
	color: '#3b82f6',
	icon: null,
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
const walmart = {
	id: 20,
	name: 'Walmart',
	color: '#3b82f6',
	createdBy: 1,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null,
	deletedAt: null,
	version: 1
};
const costco = {
	id: 21,
	name: 'Costco',
	color: '#ef4444',
	createdBy: 1,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null,
	deletedAt: null,
	version: 1
};

describe('Stores +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchStores).mockResolvedValue([walmart]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(async () => {
		vi.clearAllMocks();
		clearToken();
		await resetDbForTesting();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(StoresPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchList).mockRejectedValue(new TypeError('network down'));

		render(StoresPage);

		await expect.element(page.getByText('Failed to load stores.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchList).mockRejectedValue(new ApiError(500, 'List not found'));

		render(StoresPage);

		await expect.element(page.getByText('List not found')).toBeInTheDocument();
	});

	it('renders attached stores', async () => {
		render(StoresPage);

		await expect.element(page.getByText('Walmart')).toBeInTheDocument();
	});

	it('links the + button to the New Store page', async () => {
		render(StoresPage);

		const newStoreLink = page.getByRole('link', { name: 'New store' });
		await expect.element(newStoreLink).toBeInTheDocument();
		expect(newStoreLink.element().getAttribute('href')).toBe('/lists/1/stores/new');
	});

	it('restores the previously selected store on load', async () => {
		await setSelectedStoreSettings(1, { storeId: 20, filter: 'store' });

		render(StoresPage);

		await expect.element(page.getByRole('radio', { name: 'Walmart' })).toBeChecked();
	});

	it('removes a store', async () => {
		vi.mocked(detachStore).mockResolvedValue(undefined);

		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		expect(detachStore).toHaveBeenCalledWith(1, 20);
		await expect.element(page.getByText('No stores yet — tap + to add one.')).toBeInTheDocument();
	});

	it('clears the current selection when the selected store is removed', async () => {
		vi.mocked(detachStore).mockResolvedValue(undefined);

		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('radio', { name: 'Walmart' }).click();
		await expect.poll(async () => (await getSelectedStoreSettings(1)).storeId).toBe(20);

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect.poll(async () => (await getSelectedStoreSettings(1)).storeId).toBe(null);
	});

	it('reloads the list when removing a store fails without an ApiError', async () => {
		// removeStore's catch sets `error` and immediately triggers a reload
		// via loadAll(), which flips `loading` back to true in the same tick —
		// the page collapses to its "Loading…" state before the error message
		// ever paints, so what's observable here is the reload itself.
		vi.mocked(detachStore).mockRejectedValue(new TypeError('network down'));

		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect.poll(() => vi.mocked(fetchStores).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();
	});

	it('reloads the list when removing a store fails with an ApiError', async () => {
		vi.mocked(detachStore).mockRejectedValue(new ApiError(500, 'Could not remove'));

		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect.poll(() => vi.mocked(fetchStores).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();
	});

	it('selects "no store" (default order)', async () => {
		await setSelectedStoreSettings(1, { storeId: 20, filter: 'store' });

		render(StoresPage);
		await expect.element(page.getByRole('radio', { name: 'Walmart' })).toBeChecked();

		await page.getByRole('radio', { name: 'No store selected (default order)' }).click();

		// flowbite-svelte's <Radio> forwards a null `value` through a native
		// radio input, which round-trips it as '' rather than strictly
		// `null` — falsy either way, and the settings API treats both the
		// same (see $lib/api/selected-store.ts), so assert on that instead
		// of the exact type.
		await expect.poll(async () => (await getSelectedStoreSettings(1)).storeId).toBeFalsy();
	});

	it('persists "currently shopping at" when a store is selected', async () => {
		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('radio', { name: 'Walmart' }).click();

		await expect.poll(async () => (await getSelectedStoreSettings(1)).storeId).toBe(20);
	});

	it('shows the "Items shown" filter only when a store is selected', async () => {
		await setSelectedStoreSettings(1, { storeId: null, filter: 'store' });

		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		// No store selected → the filter options are hidden.
		await expect.element(page.getByText('Items shown')).not.toBeInTheDocument();

		// Selecting a store surfaces the filter, defaulting to the persisted value.
		await page.getByRole('radio', { name: 'Walmart' }).click();
		await expect.element(page.getByText('Items shown')).toBeInTheDocument();
		await expect
			.element(page.getByRole('radio', { name: "Only this store's items" }))
			.toBeChecked();
	});

	it('persists the chosen "Items shown" filter', async () => {
		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('radio', { name: 'Walmart' }).click();

		await page.getByRole('radio', { name: 'All items' }).click();
		await expect.poll(async () => (await getSelectedStoreSettings(1)).filter).toBe('all');

		await page.getByRole('radio', { name: 'This store + items with no store' }).click();
		await expect
			.poll(async () => (await getSelectedStoreSettings(1)).filter)
			.toBe('storeAndUnassigned');

		await page.getByRole('radio', { name: "Only this store's items" }).click();
		await expect.poll(async () => (await getSelectedStoreSettings(1)).filter).toBe('store');
	});

	it('restores the chosen "Items shown" filter on load', async () => {
		await setSelectedStoreSettings(1, { storeId: 20, filter: 'storeAndUnassigned' });

		render(StoresPage);

		await expect
			.element(page.getByRole('radio', { name: 'This store + items with no store' }))
			.toBeChecked();
	});

	it('cancels a rename without saving', async () => {
		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Rename Walmart' }).click();
		await page.getByRole('textbox', { name: 'Store name', exact: true }).fill('Target');
		await page.getByRole('button', { name: 'Cancel' }).click();

		expect(updateStore).not.toHaveBeenCalled();
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();
	});

	it('renames a store, leaving other stores untouched', async () => {
		vi.mocked(fetchStores).mockResolvedValue([walmart, costco]);
		vi.mocked(updateStore).mockResolvedValue({
			...walmart,
			name: 'Target',
			color: '#22c55e'
		});

		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Rename Walmart' }).click();
		const row = page.getByRole('listitem').filter({ has: page.getByRole('textbox') });
		await page.getByRole('textbox', { name: 'Store name', exact: true }).fill('Target');
		await row.getByRole('button', { name: 'Color' }).click();
		await page.getByRole('button', { name: '#22c55e' }).click();
		await row.getByRole('button', { name: 'Save' }).click();

		expect(updateStore).toHaveBeenCalledWith(20, { name: 'Target', color: '#22c55e' });
		await expect.element(page.getByText('Target')).toBeInTheDocument();
		await expect.element(page.getByText('Costco')).toBeInTheDocument();
	});

	it('falls back to the local edit values when updateStore resolves without a row', async () => {
		vi.mocked(updateStore).mockResolvedValue(undefined);

		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Rename Walmart' }).click();
		await page.getByRole('textbox', { name: 'Store name', exact: true }).fill('Target');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Target')).toBeInTheDocument();
	});

	it('does not save a rename when the name is only whitespace', async () => {
		// The Save button is already disabled in this state, but saveStoreEdit
		// carries its own guard, reachable via a raw 'submit' event and not
		// just a click on the (disabled) button.
		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Rename Walmart' }).click();
		const input = page.getByRole('textbox', { name: 'Store name', exact: true });
		await input.fill('   ');
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(updateStore).mock.calls.length).toBe(0);
	});

	it('shows a generic error message when renaming fails without an ApiError', async () => {
		vi.mocked(updateStore).mockRejectedValue(new TypeError('network down'));

		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Rename Walmart' }).click();
		await page.getByRole('textbox', { name: 'Store name', exact: true }).fill('Target');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to update store.')).toBeInTheDocument();
	});

	it('shows the ApiError message when renaming fails', async () => {
		vi.mocked(updateStore).mockRejectedValue(new ApiError(422, 'Duplicate name'));

		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Rename Walmart' }).click();
		await page.getByRole('textbox', { name: 'Store name', exact: true }).fill('Target');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Duplicate name')).toBeInTheDocument();
	});
});
