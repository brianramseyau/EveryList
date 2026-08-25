import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CategoryDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/categories', () => ({ bulkImportCategories: vi.fn() }));

const { bulkImportCategories } = await import('$lib/api/categories');
const { goto } = await import('$app/navigation');
const PastePage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

function makeCategory(
	overrides: Partial<CategoryDto> & Pick<CategoryDto, 'id' | 'name'>
): CategoryDto {
	return {
		icon: 'tag',
		sortOrder: 0,
		listId: 1,
		isDefault: false,
		createdAt: TS,
		updatedAt: null,
		deletedAt: null,
		version: 1,
		...overrides
	};
}

describe('Paste Categories +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('sets the document title', async () => {
		render(PastePage);

		await expect.poll(() => document.title).toBe('Paste Categories — EveryList');
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(PastePage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('disables Save until text is entered', async () => {
		render(PastePage);

		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();

		await page.getByPlaceholder('One category per line').fill('Produce');

		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeDisabled();
	});

	it('imports the pasted categories, then navigates back to the categories list', async () => {
		vi.mocked(bulkImportCategories).mockResolvedValue([
			makeCategory({ id: 10, name: 'Produce', icon: 'fruitCherries' }),
			makeCategory({ id: 11, name: 'Dairy', icon: 'cheese' })
		]);

		render(PastePage);

		await page.getByPlaceholder('One category per line').fill('Produce\nDairy');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(bulkImportCategories).toHaveBeenCalledWith(1, 'Produce\nDairy');
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(vi.mocked(goto).mock.calls[0]?.[0]).toBe('/lists/1/categories');
	});

	it('does not submit when the pasted text is only whitespace', async () => {
		render(PastePage);

		await page.getByPlaceholder('One category per line').fill('   ');
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();

		expect(bulkImportCategories).not.toHaveBeenCalled();
	});

	it('shows a generic error message when importing fails without an ApiError', async () => {
		vi.mocked(bulkImportCategories).mockRejectedValue(new TypeError('network down'));

		render(PastePage);

		await page.getByPlaceholder('One category per line').fill('Produce');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to import categories.')).toBeInTheDocument();
	});

	it('shows the ApiError message when importing fails', async () => {
		vi.mocked(bulkImportCategories).mockRejectedValue(
			new ApiError(422, 'Could not parse categories')
		);

		render(PastePage);

		await page.getByPlaceholder('One category per line').fill('Produce');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Could not parse categories')).toBeInTheDocument();
	});

	it('links Cancel back to the categories list', async () => {
		render(PastePage);

		const cancelLink = page.getByRole('link', { name: 'Cancel' });
		await expect.element(cancelLink).toBeInTheDocument();
		expect(cancelLink.element().getAttribute('href')).toBe('/lists/1/categories');
	});
});
