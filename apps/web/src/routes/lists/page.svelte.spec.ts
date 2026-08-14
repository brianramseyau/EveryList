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

	it('does not submit when the new list name is only whitespace', async () => {
		// The Add button is already disabled in this state, but handleCreate
		// carries its own guard, reachable via a raw 'submit' event and not
		// just a click on the (disabled) button.
		setToken('test-token');
		const fetchMock = vi
			.fn()
			.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [] }) });
		vi.stubGlobal('fetch', fetchMock);

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — create one above.')).toBeInTheDocument();

		const input = page.getByPlaceholder('New list name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		// Only the initial GET to load the (empty) list should have happened.
		await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
	});

	it('picks an icon and a color for the new list', async () => {
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
							color: '#22c55e',
							icon: 'tag',
							itemCount: 0
						}
					})
			});
		vi.stubGlobal('fetch', fetchMock);

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — create one above.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Format List Checks' }).click();
		await page.getByPlaceholder('Search icons…').fill('tag');
		await page.getByRole('button', { name: 'Tag', exact: true }).click();

		await page.getByRole('button', { name: 'Color' }).click();
		await page.getByRole('button', { name: '#22c55e' }).click();

		await page.getByPlaceholder('New list name').fill('Camping');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Camping')).toBeInTheDocument();
		const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
		expect(body).toEqual({ name: 'Camping', color: '#22c55e', icon: 'tag' });
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

	it('shows a generic error message when creating a list fails without an ApiError', async () => {
		setToken('test-token');
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) })
			.mockRejectedValueOnce(new TypeError('network down'));
		vi.stubGlobal('fetch', fetchMock);

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — create one above.')).toBeInTheDocument();

		await page.getByPlaceholder('New list name').fill('Camping');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Failed to create list.')).toBeInTheDocument();
	});

	it('shows the ApiError message when creating a list fails', async () => {
		setToken('test-token');
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) })
			.mockResolvedValueOnce({
				ok: false,
				status: 422,
				json: () => Promise.resolve({ message: 'Name already exists' })
			});
		vi.stubGlobal('fetch', fetchMock);

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — create one above.')).toBeInTheDocument();

		await page.getByPlaceholder('New list name').fill('Camping');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Name already exists')).toBeInTheDocument();
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
