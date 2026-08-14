import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/stores', () => ({
	fetchStores: vi.fn(),
	attachStore: vi.fn(),
	detachStore: vi.fn()
}));
vi.mock('$lib/api/selected-store', () => ({
	getSelectedStore: vi.fn(),
	setSelectedStore: vi.fn()
}));

const { fetchList } = await import('$lib/api/lists');
const { fetchStores, attachStore, detachStore } = await import('$lib/api/stores');
const { getSelectedStore, setSelectedStore } = await import('$lib/api/selected-store');
const { goto } = await import('$app/navigation');
const StoresPage = (await import('./+page.svelte')).default;

const list = {
	id: 1,
	name: 'Groceries',
	color: '#3b82f6',
	icon: null,
	ownerId: 1,
	archived: false,
	itemCount: 0,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null
};
const walmart = {
	id: 20,
	name: 'Walmart',
	color: '#3b82f6',
	createdBy: 1,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null
};

describe('Stores +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchStores).mockResolvedValue([walmart]);
		vi.mocked(getSelectedStore).mockReturnValue(null);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
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

	it('renders attached stores', async () => {
		render(StoresPage);

		await expect.element(page.getByText('Walmart')).toBeInTheDocument();
	});

	it('creates a new store from the form', async () => {
		vi.mocked(attachStore).mockResolvedValue({
			id: 21,
			name: 'Costco',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null
		});

		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByPlaceholder('New store name').fill('Costco');
		await page.getByRole('button', { name: 'Add store' }).click();

		expect(attachStore).toHaveBeenCalledWith(1, { name: 'Costco', color: '#3b82f6' });
		await expect.element(page.getByText('Costco')).toBeInTheDocument();
	});

	it('removes a store', async () => {
		vi.mocked(detachStore).mockResolvedValue(undefined);

		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		expect(detachStore).toHaveBeenCalledWith(1, 20);
	});

	it('persists "currently shopping at" when a store is selected', async () => {
		render(StoresPage);
		await expect.element(page.getByText('Walmart')).toBeInTheDocument();

		await page.getByRole('radio', { name: 'Walmart' }).click();

		await expect.poll(() => vi.mocked(setSelectedStore).mock.calls.at(-1)).toEqual([1, 20]);
	});
});
