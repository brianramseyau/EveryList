import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchLists: vi.fn() }));
vi.mock('$lib/api/alexa', () => ({
	fetchAlexaPreference: vi.fn(),
	updateAlexaPreference: vi.fn()
}));

const { fetchLists } = await import('$lib/api/lists');
const { fetchAlexaPreference, updateAlexaPreference } = await import('$lib/api/alexa');
const { goto } = await import('$app/navigation');
const AlexaPage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

function list(overrides: Partial<{ id: number; name: string }>) {
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

function preference(overrides: Partial<{ defaultListId: number | null; showChecked: boolean }>) {
	return { defaultListId: null, showChecked: true, ...overrides };
}

describe('Alexa +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchLists).mockResolvedValue([list({})]);
		vi.mocked(fetchAlexaPreference).mockResolvedValue(preference({}));
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(AlexaPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchLists).mockRejectedValue(new TypeError('network down'));

		render(AlexaPage);

		await expect.element(page.getByText('Failed to load Alexa settings.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchAlexaPreference).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(AlexaPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('shows "Ask each time" and the show-checked toggle on when nothing has ever been set', async () => {
		render(AlexaPage);

		await expect.element(page.getByRole('combobox', { name: 'Default list' })).toHaveValue('');
		await expect.element(page.getByRole('checkbox', { name: 'Show checked items' })).toBeChecked();
	});

	it('defaults the toggle on when the API omits showChecked entirely', async () => {
		vi.mocked(fetchAlexaPreference).mockResolvedValue({ defaultListId: null });

		render(AlexaPage);

		await expect.element(page.getByRole('checkbox', { name: 'Show checked items' })).toBeChecked();
	});

	it('pre-selects the saved default list and reflects showChecked: false', async () => {
		vi.mocked(fetchLists).mockResolvedValue([
			list({ id: 1, name: 'Groceries' }),
			list({ id: 2, name: 'Hardware Store' })
		]);
		vi.mocked(fetchAlexaPreference).mockResolvedValue(
			preference({ defaultListId: 2, showChecked: false })
		);

		render(AlexaPage);

		await expect.element(page.getByRole('combobox', { name: 'Default list' })).toHaveValue('2');
		await expect
			.element(page.getByRole('checkbox', { name: 'Show checked items' }))
			.not.toBeChecked();
	});

	it('sets a default list, and can clear it back to "Ask each time"', async () => {
		vi.mocked(fetchLists).mockResolvedValue([list({ id: 1, name: 'Groceries' })]);
		vi.mocked(updateAlexaPreference).mockResolvedValueOnce(
			preference({ defaultListId: 1, showChecked: true })
		);

		render(AlexaPage);
		await expect.element(page.getByRole('combobox', { name: 'Default list' })).toBeInTheDocument();
		await page.getByRole('combobox', { name: 'Default list' }).selectOptions('1');

		expect(updateAlexaPreference).toHaveBeenCalledWith({ defaultListId: 1 });

		vi.mocked(updateAlexaPreference).mockResolvedValueOnce(
			preference({ defaultListId: null, showChecked: true })
		);
		await page.getByRole('combobox', { name: 'Default list' }).selectOptions('');

		expect(updateAlexaPreference).toHaveBeenCalledWith({ defaultListId: null });
	});

	it('toggles showChecked off then on', async () => {
		vi.mocked(updateAlexaPreference).mockResolvedValueOnce(preference({ showChecked: false }));

		render(AlexaPage);
		await expect
			.element(page.getByRole('checkbox', { name: 'Show checked items' }))
			.toBeInTheDocument();
		await page.getByRole('checkbox', { name: 'Show checked items' }).click();

		expect(updateAlexaPreference).toHaveBeenCalledWith({ showChecked: false });
		await expect
			.element(page.getByRole('checkbox', { name: 'Show checked items' }))
			.not.toBeChecked();

		vi.mocked(updateAlexaPreference).mockResolvedValueOnce(preference({ showChecked: true }));
		await page.getByRole('checkbox', { name: 'Show checked items' }).click();

		expect(updateAlexaPreference).toHaveBeenCalledWith({ showChecked: true });
	});

	it('shows the ApiError message when an update fails', async () => {
		vi.mocked(updateAlexaPreference).mockRejectedValue(new ApiError(403, 'Not allowed'));

		render(AlexaPage);
		await expect
			.element(page.getByRole('checkbox', { name: 'Show checked items' }))
			.toBeInTheDocument();
		await page.getByRole('checkbox', { name: 'Show checked items' }).click();

		await expect.element(page.getByText('Not allowed')).toBeInTheDocument();
	});

	it('shows a generic error message when an update fails without an ApiError', async () => {
		vi.mocked(updateAlexaPreference).mockRejectedValue(new TypeError('network down'));

		render(AlexaPage);
		await expect
			.element(page.getByRole('checkbox', { name: 'Show checked items' }))
			.toBeInTheDocument();
		await page.getByRole('checkbox', { name: 'Show checked items' }).click();

		await expect.element(page.getByText('Failed to update Alexa settings.')).toBeInTheDocument();
	});

	it('clears a stale error once a later update succeeds', async () => {
		vi.mocked(updateAlexaPreference).mockRejectedValueOnce(new ApiError(403, 'Not allowed'));

		render(AlexaPage);
		await expect
			.element(page.getByRole('checkbox', { name: 'Show checked items' }))
			.toBeInTheDocument();
		await page.getByRole('checkbox', { name: 'Show checked items' }).click();
		await expect.element(page.getByText('Not allowed')).toBeInTheDocument();

		vi.mocked(updateAlexaPreference).mockResolvedValueOnce(preference({ showChecked: true }));
		await page.getByRole('checkbox', { name: 'Show checked items' }).click();

		await expect.element(page.getByText('Not allowed')).not.toBeInTheDocument();
	});
});
