import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchLists: vi.fn() }));
vi.mock('$lib/widget', () => ({ configureWidget: vi.fn() }));

const { fetchLists } = await import('$lib/api/lists');
const { configureWidget } = await import('$lib/widget');
const { goto } = await import('$app/navigation');
const WidgetPage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

function list(
	overrides: Partial<{ id: number; name: string; role: 'owner' | 'editor' | 'viewer' }>
) {
	return {
		id: 1,
		name: 'Groceries',
		color: '#3b82f6',
		icon: null,
		ownerId: 1,
		folderId: null,
		badgeExcluded: false,
		passcodeHash: null,
		archived: false,
		itemCount: 0,
		role: 'owner' as const,
		createdAt: TS,
		updatedAt: null,
		version: 1,
		...overrides
	};
}

describe('Home-screen widget +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchLists).mockResolvedValue([list({})]);
		vi.mocked(goto).mockResolvedValue(undefined);
		vi.mocked(configureWidget).mockResolvedValue(true);
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		clearToken();
	});

	it('sets the document title', async () => {
		render(WidgetPage);

		await expect.poll(() => document.title).toBe('Home-screen widget — EveryList');
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(WidgetPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading lists fails without an ApiError', async () => {
		vi.mocked(fetchLists).mockRejectedValue(new TypeError('network down'));

		render(WidgetPage);

		await expect.element(page.getByText('Failed to load lists.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading lists fails', async () => {
		vi.mocked(fetchLists).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(WidgetPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('shows an empty state when the user owns no lists', async () => {
		vi.mocked(fetchLists).mockResolvedValue([list({ role: 'editor' })]);

		render(WidgetPage);

		await expect
			.element(page.getByText('You need to own a list before you can set up the widget for it.'))
			.toBeInTheDocument();
	});

	it('mints the widget PAT and reports success when the handoff completes', async () => {
		render(WidgetPage);

		await page.getByRole('checkbox', { name: 'Groceries' }).click();
		await page.getByRole('button', { name: 'Create widget' }).click();

		await expect.poll(() => vi.mocked(configureWidget).mock.calls.length).toBe(1);
		expect(configureWidget).toHaveBeenCalledWith([1]);
		await expect.element(page.getByText(/Widget set up/)).toBeInTheDocument();
	});

	it('shows an error message when the handoff fails', async () => {
		vi.mocked(configureWidget).mockRejectedValue(new ApiError(422, 'Token invalid.'));

		render(WidgetPage);

		await page.getByRole('checkbox', { name: 'Groceries' }).click();
		await page.getByRole('button', { name: 'Create widget' }).click();

		await expect.element(page.getByText('Token invalid.')).toBeInTheDocument();
		await expect.element(page.getByText(/Widget set up/)).not.toBeInTheDocument();
	});

	it('includes the underlying error message when the handoff fails without an ApiError', async () => {
		vi.mocked(configureWidget).mockRejectedValue(new TypeError('no launcher'));

		render(WidgetPage);

		await page.getByRole('checkbox', { name: 'Groceries' }).click();
		await page.getByRole('button', { name: 'Create widget' }).click();

		await expect
			.element(page.getByText('Failed to set up the widget: no launcher'))
			.toBeInTheDocument();
	});

	it('shows the generic message when the handoff fails with a non-Error value', async () => {
		vi.mocked(configureWidget).mockRejectedValue('boom');

		render(WidgetPage);

		await page.getByRole('checkbox', { name: 'Groceries' }).click();
		await page.getByRole('button', { name: 'Create widget' }).click();

		await expect.element(page.getByText('Failed to set up the widget.')).toBeInTheDocument();
	});

	it('disables the button until at least one list is chosen', async () => {
		render(WidgetPage);

		await expect.element(page.getByRole('button', { name: 'Create widget' })).toBeDisabled();
	});
});
