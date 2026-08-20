import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ItemDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/items', () => ({ importItems: vi.fn() }));

const { importItems } = await import('$lib/api/items');
const { goto } = await import('$app/navigation');
const ImportPage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

function makeItem(overrides: Partial<ItemDto> & Pick<ItemDto, 'id' | 'name'>): ItemDto {
	return {
		listId: 1,
		quantity: null,
		notes: null,
		categoryId: null,
		storeId: null,
		price: null,
		checked: false,
		checkedAt: null,
		sortOrder: 0,
		createdBy: 1,
		createdAt: TS,
		updatedAt: null,
		deletedAt: null,
		version: 1,
		...overrides
	};
}

describe('Paste Items +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(goto).mockResolvedValue(undefined);
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

	it('disables Save until text is entered', async () => {
		render(ImportPage);

		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();

		await page.getByPlaceholder('One item per line, or paste an AnyList list').fill('Milk');

		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeDisabled();
	});

	it('imports the pasted items, then navigates back to the list', async () => {
		vi.mocked(importItems).mockResolvedValue([
			makeItem({ id: 400, name: 'Milk' }),
			makeItem({ id: 401, name: 'Bread' })
		]);

		render(ImportPage);

		await page.getByPlaceholder('One item per line, or paste an AnyList list').fill('Milk\nBread');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(importItems).toHaveBeenCalledWith(1, 'Milk\nBread');
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(vi.mocked(goto).mock.calls[0]?.[0]).toBe('/lists/1');
	});

	it('does not submit when the pasted text is only whitespace', async () => {
		render(ImportPage);

		await page.getByPlaceholder('One item per line, or paste an AnyList list').fill('   ');
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();

		expect(importItems).not.toHaveBeenCalled();
	});

	it('shows a generic error message when importing fails without an ApiError', async () => {
		vi.mocked(importItems).mockRejectedValue(new TypeError('network down'));

		render(ImportPage);

		await page.getByPlaceholder('One item per line, or paste an AnyList list').fill('Milk');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to import items.')).toBeInTheDocument();
	});

	it('shows the ApiError message when importing fails', async () => {
		vi.mocked(importItems).mockRejectedValue(new ApiError(422, 'Could not parse items'));

		render(ImportPage);

		await page.getByPlaceholder('One item per line, or paste an AnyList list').fill('Milk');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Could not parse items')).toBeInTheDocument();
	});

	it('links Cancel back to the list', async () => {
		render(ImportPage);

		const cancelLink = page.getByRole('link', { name: 'Cancel' });
		await expect.element(cancelLink).toBeInTheDocument();
		expect(cancelLink.element().getAttribute('href')).toBe('/lists/1');
	});
});
