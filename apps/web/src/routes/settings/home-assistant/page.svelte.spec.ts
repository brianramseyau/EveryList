import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/ha-link', () => ({
	fetchHaLink: vi.fn(),
	updateHaLink: vi.fn()
}));

const { fetchHaLink, updateHaLink } = await import('$lib/api/ha-link');
const { goto } = await import('$app/navigation');
const HaSettingsPage = (await import('./+page.svelte')).default;

function link(
	overrides: Partial<{
		linkedHaUsername: string | null;
		detectedHaUsername: string | null;
		detectedHaDisplayName: string | null;
	}>
) {
	return {
		linkedHaUsername: null,
		detectedHaUsername: null,
		detectedHaDisplayName: null,
		...overrides
	};
}

describe('Home Assistant +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchHaLink).mockResolvedValue(link({}));
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(HaSettingsPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchHaLink).mockRejectedValue(new TypeError('network down'));

		render(HaSettingsPage);

		await expect
			.element(page.getByText('Failed to load Home Assistant settings.'))
			.toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchHaLink).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(HaSettingsPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('shows "Not linked" and no one-click button with no detected identity', async () => {
		render(HaSettingsPage);

		await expect.element(page.getByText('Not linked')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Link this account' }))
			.not.toBeInTheDocument();
	});

	it('offers one-click linking (no password needed) when an identity is detected but not yet linked', async () => {
		vi.mocked(fetchHaLink).mockResolvedValue(
			link({ detectedHaUsername: 'alice', detectedHaDisplayName: 'Alice' })
		);
		vi.mocked(updateHaLink).mockResolvedValue(
			link({
				linkedHaUsername: 'alice',
				detectedHaUsername: 'alice',
				detectedHaDisplayName: 'Alice'
			})
		);

		render(HaSettingsPage);

		await expect.element(page.getByText('Home Assistant identifies you as')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Link this account' }).click();

		expect(updateHaLink).toHaveBeenCalledWith({ haUsername: 'alice', password: undefined });
		await expect.element(page.getByText('alice')).toBeInTheDocument();
	});

	it('hides the one-click button once the detected identity is already linked', async () => {
		vi.mocked(fetchHaLink).mockResolvedValue(
			link({
				linkedHaUsername: 'alice',
				detectedHaUsername: 'alice',
				detectedHaDisplayName: 'Alice'
			})
		);

		render(HaSettingsPage);

		await expect
			.element(page.getByRole('button', { name: 'Link this account' }))
			.not.toBeInTheDocument();
	});

	it('requires both a username and a password before the manual Link button is enabled', async () => {
		render(HaSettingsPage);

		const linkButton = page.getByRole('button', { name: 'Link' });
		await expect.element(linkButton).toBeDisabled();

		await page.getByLabelText('Home Assistant username').fill('bob');
		await expect.element(linkButton).toBeDisabled();

		await page.getByLabelText('Home Assistant password').fill('secret');
		await expect.element(linkButton).toBeEnabled();
	});

	it('links a username typed in manually with its password', async () => {
		vi.mocked(updateHaLink).mockResolvedValue(link({ linkedHaUsername: 'bob' }));

		render(HaSettingsPage);

		await page.getByLabelText('Home Assistant username').fill('bob');
		await page.getByLabelText('Home Assistant password').fill('secret');
		await page.getByRole('button', { name: 'Link' }).click();

		expect(updateHaLink).toHaveBeenCalledWith({ haUsername: 'bob', password: 'secret' });
		await expect.element(page.getByText('bob')).toBeInTheDocument();
	});

	it('unlinks a linked account', async () => {
		vi.mocked(fetchHaLink).mockResolvedValue(link({ linkedHaUsername: 'alice' }));
		vi.mocked(updateHaLink).mockResolvedValue(link({}));

		render(HaSettingsPage);
		await expect.element(page.getByRole('button', { name: 'Unlink' })).toBeInTheDocument();
		await page.getByRole('button', { name: 'Unlink' }).click();

		expect(updateHaLink).toHaveBeenCalledWith({ haUsername: null, password: undefined });
		await expect.element(page.getByText('Not linked')).toBeInTheDocument();
	});

	it('shows a generic error message when linking fails without an ApiError', async () => {
		vi.mocked(updateHaLink).mockRejectedValue(new TypeError('network down'));

		render(HaSettingsPage);

		await page.getByLabelText('Home Assistant username').fill('bob');
		await page.getByLabelText('Home Assistant password').fill('secret');
		await page.getByRole('button', { name: 'Link' }).click();

		await expect
			.element(page.getByText('Failed to update Home Assistant settings.'))
			.toBeInTheDocument();
	});

	it('shows the ApiError message when linking fails', async () => {
		vi.mocked(updateHaLink).mockRejectedValue(
			new ApiError(
				400,
				'That Home Assistant account is already linked to a different EveryList account.'
			)
		);

		render(HaSettingsPage);

		await page.getByLabelText('Home Assistant username').fill('bob');
		await page.getByLabelText('Home Assistant password').fill('secret');
		await page.getByRole('button', { name: 'Link' }).click();

		await expect
			.element(
				page.getByText(
					'That Home Assistant account is already linked to a different EveryList account.'
				)
			)
			.toBeInTheDocument();
	});
});
