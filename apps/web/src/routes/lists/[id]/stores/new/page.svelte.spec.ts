import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/stores', () => ({ attachStore: vi.fn() }));

const { goto } = await import('$app/navigation');
const { attachStore } = await import('$lib/api/stores');
const NewStorePage = (await import('./+page.svelte')).default;

describe('New Store +page.svelte', () => {
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

		render(NewStorePage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('disables Save until a name is entered', async () => {
		render(NewStorePage);

		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();

		await page.getByPlaceholder('Store name').fill('Costco');

		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeDisabled();
	});

	it('does not submit when the name is only whitespace', async () => {
		render(NewStorePage);

		const input = page.getByPlaceholder('Store name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(attachStore).mock.calls.length).toBe(0);
	});

	it('creates a store with the default color, then navigates back to the stores screen', async () => {
		vi.mocked(attachStore).mockResolvedValue({
			id: 20,
			name: 'Costco',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(NewStorePage);

		await page.getByPlaceholder('Store name').fill('Costco');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(attachStore).toHaveBeenCalledWith(1, { name: 'Costco', color: '#3b82f6' });
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(vi.mocked(goto).mock.calls[0]?.[0]).toBe('/lists/1/stores');
	});

	it('picks a color for the new store', async () => {
		vi.mocked(attachStore).mockResolvedValue({
			id: 20,
			name: 'Costco',
			color: '#22c55e',
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(NewStorePage);

		await page.getByRole('button', { name: 'Color' }).click();
		await page.getByRole('button', { name: '#22c55e' }).click();

		await page.getByPlaceholder('Store name').fill('Costco');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(attachStore).toHaveBeenCalledWith(1, { name: 'Costco', color: '#22c55e' });
	});

	it('shows a generic error message when creating a store fails without an ApiError', async () => {
		vi.mocked(attachStore).mockRejectedValue(new TypeError('network down'));

		render(NewStorePage);

		await page.getByPlaceholder('Store name').fill('Costco');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to create store.')).toBeInTheDocument();
	});

	it('shows the ApiError message when creating a store fails', async () => {
		vi.mocked(attachStore).mockRejectedValue(new ApiError(422, 'Name already exists'));

		render(NewStorePage);

		await page.getByPlaceholder('Store name').fill('Costco');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Name already exists')).toBeInTheDocument();
	});

	it('links Cancel back to the stores screen', async () => {
		render(NewStorePage);

		const cancelLink = page.getByRole('link', { name: 'Cancel' });
		await expect.element(cancelLink).toBeInTheDocument();
		expect(cancelLink.element().getAttribute('href')).toBe('/lists/1/stores');
	});
});
