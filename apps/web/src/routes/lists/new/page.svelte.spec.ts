import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ createList: vi.fn() }));

const { goto } = await import('$app/navigation');
const { createList } = await import('$lib/api/lists');
const NewListPage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

const SHOPPING_FEATURES = {
	useCategories: true,
	useCategoryLearning: true,
	useShops: true,
	showStoreInList: true,
	useFavorites: true,
	useRecent: true,
	useQuantity: true,
	usePrice: true,
	showPriceInList: true,
	useDeadline: false
};

describe('New List +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('sets the document title', async () => {
		render(NewListPage);

		await expect.poll(() => document.title).toBe('New List — EveryList');
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(NewListPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('disables Save until a name is entered', async () => {
		render(NewListPage);

		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();

		await page.getByPlaceholder('List name').fill('Camping');

		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeDisabled();
	});

	it('does not submit when the name is only whitespace', async () => {
		render(NewListPage);

		const input = page.getByPlaceholder('List name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(createList).mock.calls.length).toBe(0);
	});

	it('defaults to the Shopping prefab, creating a list with its full feature set', async () => {
		vi.mocked(createList).mockResolvedValue({
			id: 9,
			name: 'Camping',
			archived: false,
			color: '#3b82f6',
			icon: 'formatListChecks',
			itemCount: 0,
			ownerId: 1,
			folderId: null,
			badgeExcluded: false,
			passcodeHash: null,
			createdAt: TS,
			updatedAt: null,
			version: 1
		});

		render(NewListPage);

		await expect
			.element(page.getByRole('button', { name: /Shopping/ }))
			.toHaveAttribute('aria-pressed', 'true');

		await page.getByPlaceholder('List name').fill('Camping');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(createList).toHaveBeenCalledWith({
			name: 'Camping',
			color: '#3b82f6',
			icon: 'formatListChecks',
			...SHOPPING_FEATURES
		});
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(vi.mocked(goto).mock.calls[0]?.[0]).toBe('/lists');
	});

	it('creates a list from the form on enter/submit', async () => {
		vi.mocked(createList).mockResolvedValue({
			id: 9,
			name: 'Camping',
			archived: false,
			color: '#3b82f6',
			icon: 'formatListChecks',
			itemCount: 0,
			ownerId: 1,
			folderId: null,
			badgeExcluded: false,
			passcodeHash: null,
			createdAt: TS,
			updatedAt: null,
			version: 1
		});

		render(NewListPage);

		const input = page.getByPlaceholder('List name');
		await input.fill('Camping');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		expect(createList).toHaveBeenCalledWith({
			name: 'Camping',
			color: '#3b82f6',
			icon: 'formatListChecks',
			...SHOPPING_FEATURES
		});
	});

	it('picks an icon and a color for the new list', async () => {
		vi.mocked(createList).mockResolvedValue({
			id: 9,
			name: 'Camping',
			archived: false,
			color: '#22c55e',
			icon: 'tag',
			itemCount: 0,
			ownerId: 1,
			folderId: null,
			badgeExcluded: false,
			passcodeHash: null,
			createdAt: TS,
			updatedAt: null,
			version: 1
		});

		render(NewListPage);

		await page.getByRole('button', { name: 'Format List Checks' }).click();
		await page.getByPlaceholder('Search icons…').fill('tag');
		await page.getByRole('button', { name: 'Tag', exact: true }).click();

		await page.getByRole('button', { name: 'Color' }).click();
		await page.getByRole('button', { name: '#22c55e' }).click();

		await page.getByPlaceholder('List name').fill('Camping');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(createList).toHaveBeenCalledWith({
			name: 'Camping',
			color: '#22c55e',
			icon: 'tag',
			...SHOPPING_FEATURES
		});
	});

	it('selects the Todo/Chores prefab, sorting by deadline and offering an open item limit', async () => {
		vi.mocked(createList).mockResolvedValue({
			id: 9,
			name: 'Chores',
			archived: false,
			color: '#3b82f6',
			icon: 'formatListChecks',
			itemCount: 0,
			ownerId: 1,
			folderId: null,
			badgeExcluded: false,
			passcodeHash: null,
			createdAt: TS,
			updatedAt: null,
			version: 1
		});

		render(NewListPage);

		await page.getByRole('button', { name: /Todo \/ Chores/ }).click();
		await expect
			.element(page.getByRole('spinbutton', { name: 'Open item limit (optional)' }))
			.toBeInTheDocument();

		await page.getByRole('spinbutton', { name: 'Open item limit (optional)' }).fill('5');
		await page.getByPlaceholder('List name').fill('Chores');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(createList).toHaveBeenCalledWith({
			name: 'Chores',
			color: '#3b82f6',
			icon: 'formatListChecks',
			useCategories: false,
			useCategoryLearning: false,
			useShops: false,
			showStoreInList: false,
			useFavorites: false,
			useRecent: true,
			useQuantity: false,
			usePrice: false,
			showPriceInList: false,
			useDeadline: true,
			itemSortOrder: 'deadline',
			maxUncheckedItems: 5
		});
	});

	it('leaves out the open item limit when left blank on the Todo/Chores prefab', async () => {
		vi.mocked(createList).mockResolvedValue({
			id: 9,
			name: 'Chores',
			archived: false,
			color: '#3b82f6',
			icon: 'formatListChecks',
			itemCount: 0,
			ownerId: 1,
			folderId: null,
			badgeExcluded: false,
			passcodeHash: null,
			createdAt: TS,
			updatedAt: null,
			version: 1
		});

		render(NewListPage);

		await page.getByRole('button', { name: /Todo \/ Chores/ }).click();
		// Fill then clear — a Flowbite number input hands back `null` (not '') once
		// emptied, exercising the same nullish-coalescing fallback as the settings
		// page's open-item-limit draft.
		const limitInput = page.getByRole('spinbutton', { name: 'Open item limit (optional)' });
		await limitInput.fill('5');
		await limitInput.fill('');
		await page.getByPlaceholder('List name').fill('Chores');
		await page.getByRole('button', { name: 'Save' }).click();

		const call = vi.mocked(createList).mock.calls[0]?.[0];
		expect(call).not.toHaveProperty('maxUncheckedItems');
	});

	it('selects Custom, showing every toggle and creating the list with only the chosen ones', async () => {
		vi.mocked(createList).mockResolvedValue({
			id: 9,
			name: 'Mixed',
			archived: false,
			color: '#3b82f6',
			icon: 'formatListChecks',
			itemCount: 0,
			ownerId: 1,
			folderId: null,
			badgeExcluded: false,
			useCategories: false,
			passcodeHash: null,
			createdAt: TS,
			updatedAt: null,
			version: 1
		});

		render(NewListPage);

		await page.getByRole('button', { name: 'Custom' }).click();
		await expect
			.element(page.getByRole('checkbox', { name: 'Categories', exact: true }))
			.toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'Deadlines' })).not.toBeChecked();

		await page.getByRole('checkbox', { name: 'Categories', exact: true }).click();
		await page.getByPlaceholder('List name').fill('Mixed');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(createList).toHaveBeenCalledWith({
			name: 'Mixed',
			color: '#3b82f6',
			icon: 'formatListChecks',
			...SHOPPING_FEATURES,
			useCategories: false
		});
	});

	it('shows a generic error message when creating a list fails without an ApiError', async () => {
		vi.mocked(createList).mockRejectedValue(new TypeError('network down'));

		render(NewListPage);

		await page.getByPlaceholder('List name').fill('Camping');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to create list.')).toBeInTheDocument();
	});

	it('shows the ApiError message when creating a list fails', async () => {
		vi.mocked(createList).mockRejectedValue(new ApiError(422, 'Name already exists'));

		render(NewListPage);

		await page.getByPlaceholder('List name').fill('Camping');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Name already exists')).toBeInTheDocument();
	});

	it('links Cancel back to the lists screen', async () => {
		render(NewListPage);

		const cancelLink = page.getByRole('link', { name: 'Cancel' });
		await expect.element(cancelLink).toBeInTheDocument();
		expect(cancelLink.element().getAttribute('href')).toBe('/lists');
	});
});
