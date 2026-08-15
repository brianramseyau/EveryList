import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const { goto } = await import('$app/navigation');
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

		await expect.element(page.getByText('No lists yet — tap + to create one.')).toBeInTheDocument();
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		setToken('test-token');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

		render(ListsPage);

		await expect.element(page.getByText('Failed to load lists.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		setToken('test-token');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: () => Promise.resolve({ message: 'Server exploded' })
			})
		);

		render(ListsPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('shows the singular "item" label for a list with exactly one item', async () => {
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
								itemCount: 1
							}
						]
					})
			})
		);

		render(ListsPage);

		await expect.element(page.getByText('1 item', { exact: true })).toBeInTheDocument();
	});

	it('links the "New list" button to the dedicated creation screen', async () => {
		setToken('test-token');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [] }) })
		);

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — tap + to create one.')).toBeInTheDocument();

		const newListLink = page.getByRole('link', { name: 'New list' });
		await expect.element(newListLink).toBeInTheDocument();
		expect(newListLink.element().getAttribute('href')).toBe('/lists/new');
	});
});
