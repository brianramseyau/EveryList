import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CategoryDto, ListDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchLists: vi.fn() }));
vi.mock('$lib/api/categories', () => ({
	fetchCategories: vi.fn(),
	importCategories: vi.fn()
}));

const { fetchLists } = await import('$lib/api/lists');
const { fetchCategories, importCategories } = await import('$lib/api/categories');
const { goto } = await import('$app/navigation');
const ImportPage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

function makeList(overrides: Partial<ListDto> & Pick<ListDto, 'id' | 'name'>): ListDto {
	return {
		color: '#3b82f6',
		icon: null,
		ownerId: 1,
		folderId: null,
		archived: false,
		badgeExcluded: false,
		passcodeHash: null,
		itemCount: 0,
		createdAt: TS,
		updatedAt: null,
		version: 1,
		...overrides
	};
}

function makeCategory(
	overrides: Partial<CategoryDto> & Pick<CategoryDto, 'id' | 'name'>
): CategoryDto {
	return {
		icon: 'tag',
		sortOrder: 0,
		listId: 2,
		isDefault: false,
		createdAt: TS,
		updatedAt: null,
		deletedAt: null,
		version: 1,
		...overrides
	};
}

describe('Import Categories +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(goto).mockResolvedValue(undefined);
		vi.mocked(fetchLists).mockResolvedValue([
			makeList({ id: 2, name: 'Groceries' }),
			makeList({ id: 3, name: 'Packing' })
		]);
		vi.mocked(fetchCategories).mockResolvedValue([
			makeCategory({ id: 10, name: 'Produce', icon: 'fruitCherries' }),
			makeCategory({ id: 11, name: 'Dairy', icon: 'cheese' })
		]);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(ImportPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('lists the other lists to copy from and asks for a source to be picked', async () => {
		render(ImportPage);

		await expect.element(page.getByRole('combobox')).toHaveValue('');
		await expect.element(page.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: 'Packing' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Import' })).toBeDisabled();
	});

	it('loads a source list categories as checked once it is picked', async () => {
		render(ImportPage);

		await page.getByRole('combobox').selectOptions('2');

		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		await expect.element(page.getByText('Dairy')).toBeInTheDocument();
		const checkboxes = page.getByRole('checkbox');
		const all = await checkboxes.all();
		expect(all.length).toBe(2);
		for (const checkbox of all) {
			expect((checkbox.element() as HTMLInputElement).checked).toBe(true);
		}
		await expect.element(page.getByRole('button', { name: 'Import' })).not.toBeDisabled();
	});

	it('imports the selected categories, then navigates back to the categories page', async () => {
		vi.mocked(importCategories).mockResolvedValue([
			makeCategory({ id: 20, name: 'Produce', listId: 1 }),
			makeCategory({ id: 21, name: 'Dairy', listId: 1 })
		]);

		render(ImportPage);

		await page.getByRole('combobox').selectOptions('2');
		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Import' }).click();

		expect(importCategories).toHaveBeenCalledWith(1, { sourceListId: 2, categoryIds: [10, 11] });
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(vi.mocked(goto).mock.calls[0]?.[0]).toBe('/lists/1/categories');
	});

	it('leaves unchecked categories out of the import', async () => {
		render(ImportPage);

		await page.getByRole('combobox').selectOptions('2');
		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		await page.getByRole('checkbox', { name: 'Dairy' }).click();
		await page.getByRole('button', { name: 'Import' }).click();

		expect(importCategories).toHaveBeenCalledWith(1, { sourceListId: 2, categoryIds: [10] });
	});

	it('disables Import once every category is unchecked', async () => {
		render(ImportPage);

		await page.getByRole('combobox').selectOptions('2');
		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		await page.getByRole('checkbox', { name: 'Produce' }).click();
		await page.getByRole('checkbox', { name: 'Dairy' }).click();

		await expect.element(page.getByRole('button', { name: 'Import' })).toBeDisabled();
	});

	it('reloads categories when the source list changes', async () => {
		render(ImportPage);

		await page.getByRole('combobox').selectOptions('2');
		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		vi.mocked(fetchCategories).mockResolvedValue([
			makeCategory({ id: 30, name: 'Toiletries', icon: 'shower', listId: 3 })
		]);

		await page.getByRole('combobox').selectOptions('3');

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Toiletries')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Import' }).click();
		expect(importCategories).toHaveBeenCalledWith(1, { sourceListId: 3, categoryIds: [30] });
	});

	it('excludes the current list from the source options', async () => {
		vi.mocked(fetchLists).mockResolvedValue([
			makeList({ id: 1, name: 'Current' }),
			makeList({ id: 2, name: 'Groceries' })
		]);

		render(ImportPage);

		await expect.element(page.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
		const options = await page.getByRole('option').all();
		const names = options.map((option) => option.element().textContent);
		expect(names).toEqual(['Choose option ...', 'Groceries']);
	});

	it('says when the user has no other lists to copy from', async () => {
		vi.mocked(fetchLists).mockResolvedValue([makeList({ id: 1, name: 'Current' })]);

		render(ImportPage);

		await expect
			.element(page.getByText("You don't have any other lists to copy categories from yet."))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Import' })).toBeDisabled();
	});

	it('says when the source list has no categories', async () => {
		vi.mocked(fetchCategories).mockResolvedValue([]);

		render(ImportPage);

		await page.getByRole('combobox').selectOptions('2');

		await expect
			.element(page.getByText('This list has no categories to import.'))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Import' })).toBeDisabled();
	});

	it('shows a generic error message when loading lists fails without an ApiError', async () => {
		vi.mocked(fetchLists).mockRejectedValue(new TypeError('network down'));

		render(ImportPage);

		await expect.element(page.getByText('Failed to load lists.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading lists fails', async () => {
		vi.mocked(fetchLists).mockRejectedValue(new ApiError(500, 'Could not load lists'));

		render(ImportPage);

		await expect.element(page.getByText('Could not load lists')).toBeInTheDocument();
	});

	it('shows a generic error message when loading categories fails without an ApiError', async () => {
		vi.mocked(fetchCategories).mockRejectedValue(new TypeError('network down'));

		render(ImportPage);

		await page.getByRole('combobox').selectOptions('2');

		await expect.element(page.getByText('Failed to load categories.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading categories fails', async () => {
		vi.mocked(fetchCategories).mockRejectedValue(new ApiError(500, 'Could not load categories'));

		render(ImportPage);

		await page.getByRole('combobox').selectOptions('2');

		await expect.element(page.getByText('Could not load categories')).toBeInTheDocument();
	});

	it('shows a generic error message when importing fails without an ApiError', async () => {
		vi.mocked(importCategories).mockRejectedValue(new TypeError('network down'));

		render(ImportPage);

		await page.getByRole('combobox').selectOptions('2');
		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Import' }).click();

		await expect.element(page.getByText('Failed to import categories.')).toBeInTheDocument();
	});

	it('shows the ApiError message when importing fails', async () => {
		vi.mocked(importCategories).mockRejectedValue(new ApiError(422, 'Choose a different list'));

		render(ImportPage);

		await page.getByRole('combobox').selectOptions('2');
		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Import' }).click();

		await expect.element(page.getByText('Choose a different list')).toBeInTheDocument();
	});

	it('links Cancel back to the categories page', async () => {
		render(ImportPage);

		const cancelLink = page.getByRole('link', { name: 'Cancel' });
		await expect.element(cancelLink).toBeInTheDocument();
		expect(cancelLink.element().getAttribute('href')).toBe('/lists/1/categories');
	});
});
