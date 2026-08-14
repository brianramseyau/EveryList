import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/auth', () => ({ logout: vi.fn() }));

const { goto } = await import('$app/navigation');
const { logout } = await import('$lib/api/auth');
const ListsPage = (await import('./+page.svelte')).default;

describe('Lists +page.svelte', () => {
	beforeEach(() => {
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		render(ListsPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('renders the lists fetched on mount', async () => {
		setToken('test-token');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						data: [
							{
								id: 1,
								name: 'Groceries',
								archived: false,
								color: '#3b82f6',
								icon: null,
								itemCount: 3
							},
							{
								id: 2,
								name: 'Hardware',
								archived: true,
								color: '#ef4444',
								icon: null,
								itemCount: 0
							}
						]
					})
			})
		);

		render(ListsPage);

		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
		await expect.element(page.getByText('Hardware')).toBeInTheDocument();
		await expect.element(page.getByText('Archived')).toBeInTheDocument();
		await expect.element(page.getByText('3 items')).toBeInTheDocument();
		await expect.element(page.getByText('0 items')).toBeInTheDocument();
	});

	it('shows an empty state when there are no lists', async () => {
		setToken('test-token');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [] }) })
		);

		render(ListsPage);

		await expect.element(page.getByText('No lists yet — create one above.')).toBeInTheDocument();
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		setToken('test-token');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

		render(ListsPage);

		await expect.element(page.getByText('Failed to load lists.')).toBeInTheDocument();
	});

	it('creates a new list from the form', async () => {
		setToken('test-token');
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) })
			.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						data: {
							id: 9,
							name: 'Camping',
							archived: false,
							color: '#3b82f6',
							icon: null,
							itemCount: 0
						}
					})
			});
		vi.stubGlobal('fetch', fetchMock);

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — create one above.')).toBeInTheDocument();

		await page.getByPlaceholder('New list name').fill('Camping');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Camping')).toBeInTheDocument();
	});

	it('logs out and navigates to /login', async () => {
		setToken('test-token');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [] }) })
		);
		vi.mocked(logout).mockResolvedValue(undefined);

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — create one above.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Log out' }).click();

		expect(logout).toHaveBeenCalled();
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});
});
