import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/categories', () => ({ createCategory: vi.fn() }));

const { goto } = await import('$app/navigation');
const { createCategory } = await import('$lib/api/categories');
const NewCategoryPage = (await import('./+page.svelte')).default;

describe('New Category +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('sets the document title', async () => {
		render(NewCategoryPage);

		await expect.poll(() => document.title).toBe('New Category — EveryList');
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(NewCategoryPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('disables Save until a name is entered', async () => {
		render(NewCategoryPage);

		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();

		await page.getByPlaceholder('Category name').fill('Snacks');

		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeDisabled();
	});

	it('does not submit when the name is only whitespace', async () => {
		render(NewCategoryPage);

		const input = page.getByPlaceholder('Category name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(createCategory).mock.calls.length).toBe(0);
	});

	it('creates a category with the default icon, then navigates back to the categories screen', async () => {
		vi.mocked(createCategory).mockResolvedValue({
			id: 12,
			listId: 1,
			name: 'Snacks',
			icon: 'tag',
			sortOrder: 2,
			isDefault: false,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(NewCategoryPage);

		await page.getByPlaceholder('Category name').fill('Snacks');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(createCategory).toHaveBeenCalledWith(1, { name: 'Snacks', icon: 'tag' });
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(vi.mocked(goto).mock.calls[0]?.[0]).toBe('/lists/1/categories');
	});

	it('picks an icon for the new category', async () => {
		vi.mocked(createCategory).mockResolvedValue({
			id: 12,
			listId: 1,
			name: 'Snacks',
			icon: 'cookie',
			sortOrder: 2,
			isDefault: false,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(NewCategoryPage);

		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByPlaceholder('Search icons…').fill('cookie');
		await page.getByRole('button', { name: 'Cookie', exact: true }).click();

		await page.getByPlaceholder('Category name').fill('Snacks');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(createCategory).toHaveBeenCalledWith(1, { name: 'Snacks', icon: 'cookie' });
	});

	it('shows a generic error message when creating a category fails without an ApiError', async () => {
		vi.mocked(createCategory).mockRejectedValue(new TypeError('network down'));

		render(NewCategoryPage);

		await page.getByPlaceholder('Category name').fill('Snacks');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to create category.')).toBeInTheDocument();
	});

	it('shows the ApiError message when creating a category fails', async () => {
		vi.mocked(createCategory).mockRejectedValue(new ApiError(422, 'Name already exists'));

		render(NewCategoryPage);

		await page.getByPlaceholder('Category name').fill('Snacks');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Name already exists')).toBeInTheDocument();
	});

	it('links Cancel back to the categories screen', async () => {
		render(NewCategoryPage);

		const cancelLink = page.getByRole('link', { name: 'Cancel' });
		await expect.element(cancelLink).toBeInTheDocument();
		expect(cancelLink.element().getAttribute('href')).toBe('/lists/1/categories');
	});
});
