import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchLists: vi.fn() }));
vi.mock('$lib/api/tokens', () => ({
	fetchTokens: vi.fn(),
	createToken: vi.fn(),
	revokeToken: vi.fn(),
	updateToken: vi.fn()
}));

const { fetchLists } = await import('$lib/api/lists');
const { fetchTokens, createToken, revokeToken, updateToken } = await import('$lib/api/tokens');
const { goto } = await import('$app/navigation');
const TokensPage = (await import('./+page.svelte')).default;

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

function token(
	overrides: Partial<{
		id: number;
		name: string | null;
		grants: { listId: number; role: 'editor' | 'viewer' }[];
	}>
) {
	return {
		id: 1,
		name: 'Home Assistant',
		grants: [{ listId: 1, role: 'editor' as const }],
		lastUsedAt: null,
		expiresAt: null,
		createdAt: TS,
		...overrides
	};
}

describe('Access Tokens +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchLists).mockResolvedValue([list({})]);
		vi.mocked(fetchTokens).mockResolvedValue([]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
		clearToken();
	});

	it('sets the document title', async () => {
		render(TokensPage);

		await expect.poll(() => document.title).toBe('Access Tokens — EveryList');
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(TokensPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchLists).mockRejectedValue(new TypeError('network down'));

		render(TokensPage);

		await expect.element(page.getByText('Failed to load tokens.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchTokens).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(TokensPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('shows a create-form empty state when the user owns no lists', async () => {
		vi.mocked(fetchLists).mockResolvedValue([list({ role: 'editor' })]);

		render(TokensPage);

		await expect
			.element(page.getByText('You need to own a list before you can create tokens for it.'))
			.toBeInTheDocument();
		await expect.element(page.getByText('New token')).not.toBeInTheDocument();
	});

	it('still shows existing tokens even when the user currently owns no lists', async () => {
		vi.mocked(fetchLists).mockResolvedValue([list({ role: 'editor' })]);
		vi.mocked(fetchTokens).mockResolvedValue([token({ id: 5, name: 'Home Assistant' })]);

		render(TokensPage);

		await expect.element(page.getByText('Home Assistant')).toBeInTheDocument();
	});

	it('lists checkboxes for each owned list in the create form', async () => {
		vi.mocked(fetchLists).mockResolvedValue([
			list({ id: 1, name: 'Groceries' }),
			list({ id: 2, name: 'Hardware Store' })
		]);

		render(TokensPage);

		await expect.element(page.getByRole('checkbox', { name: 'Groceries' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('checkbox', { name: 'Hardware Store' }))
			.toBeInTheDocument();
	});

	it('shows existing tokens with their granted list names and roles', async () => {
		vi.mocked(fetchLists).mockResolvedValue([
			list({ id: 1, name: 'Groceries' }),
			list({ id: 2, name: 'Hardware Store' })
		]);
		vi.mocked(fetchTokens).mockResolvedValue([
			token({
				id: 5,
				name: 'Home Assistant',
				grants: [
					{ listId: 1, role: 'editor' },
					{ listId: 2, role: 'editor' }
				]
			})
		]);

		render(TokensPage);

		await expect.element(page.getByText('Home Assistant')).toBeInTheDocument();
		await expect
			.element(page.getByText('Groceries (editor), Hardware Store (editor)'))
			.toBeInTheDocument();
	});

	it('falls back to a placeholder name for a grant on a list that no longer resolves', async () => {
		vi.mocked(fetchTokens).mockResolvedValue([
			token({ id: 5, grants: [{ listId: 999, role: 'viewer' }] })
		]);

		render(TokensPage);

		await expect.element(page.getByText('List #999 (viewer)')).toBeInTheDocument();
	});

	it('shows an empty state when there are no tokens yet', async () => {
		render(TokensPage);

		await expect.element(page.getByText('No tokens yet.')).toBeInTheDocument();
	});

	it('disables Create token until a name and at least one list are chosen', async () => {
		render(TokensPage);

		await expect.element(page.getByRole('button', { name: 'Create token' })).toBeDisabled();

		await page.getByPlaceholder('Name (e.g. Home Assistant)').fill('Alexa');
		await expect.element(page.getByRole('button', { name: 'Create token' })).toBeDisabled();

		await page.getByRole('checkbox', { name: 'Groceries' }).click();
		await expect.element(page.getByRole('button', { name: 'Create token' })).not.toBeDisabled();
	});

	it('creates a token scoped to the checked lists, shows the reveal-once banner, and copies it', async () => {
		vi.mocked(fetchLists).mockResolvedValue([
			list({ id: 1, name: 'Groceries' }),
			list({ id: 2, name: 'Hardware Store' })
		]);
		vi.mocked(createToken).mockResolvedValue({
			...token({
				id: 9,
				name: 'Alexa',
				grants: [
					{ listId: 1, role: 'editor' },
					{ listId: 2, role: 'editor' }
				]
			}),
			token: 'elt_abc123'
		});
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

		render(TokensPage);
		await expect.element(page.getByText('New token')).toBeInTheDocument();

		await page.getByPlaceholder('Name (e.g. Home Assistant)').fill('Alexa');
		await page.getByRole('checkbox', { name: 'Groceries' }).click();
		await page.getByRole('checkbox', { name: 'Hardware Store' }).click();
		await page.getByRole('combobox', { name: 'Role' }).selectOptions('viewer');
		await page.getByRole('button', { name: 'Create token' }).click();

		expect(createToken).toHaveBeenCalledWith('Alexa', [1, 2], 'viewer');
		await expect.element(page.getByText('elt_abc123')).toBeInTheDocument();
		await expect
			.element(page.getByText(/Copy this token now — it won't be shown again/))
			.toBeInTheDocument();
		expect(writeText).toHaveBeenCalledWith('elt_abc123');
		await expect.element(page.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
	});

	it('keeps the token visible when copying fails', async () => {
		vi.mocked(createToken).mockResolvedValue({ ...token({ id: 9 }), token: 'elt_abc123' });
		vi.stubGlobal('navigator', {
			...navigator,
			clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
		});

		render(TokensPage);
		await page.getByPlaceholder('Name (e.g. Home Assistant)').fill('Alexa');
		await page.getByRole('checkbox', { name: 'Groceries' }).click();
		await page.getByRole('button', { name: 'Create token' }).click();

		await expect.element(page.getByText('elt_abc123')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
	});

	it('re-copies and resets the confirmation after 2s', async () => {
		vi.useFakeTimers();
		vi.mocked(createToken).mockResolvedValue({ ...token({ id: 9 }), token: 'elt_abc123' });
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

		render(TokensPage);
		await page.getByPlaceholder('Name (e.g. Home Assistant)').fill('Alexa');
		await page.getByRole('checkbox', { name: 'Groceries' }).click();
		await page.getByRole('button', { name: 'Create token' }).click();
		await expect.element(page.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Copied!' }).click();
		await expect.element(page.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();

		await vi.advanceTimersByTimeAsync(2000);
		await expect.element(page.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
		expect(writeText).toHaveBeenCalledTimes(2);
	});

	it('shows the ApiError message when creating a token fails', async () => {
		vi.mocked(createToken).mockRejectedValue(new ApiError(403, 'Not an owner'));

		render(TokensPage);
		await page.getByPlaceholder('Name (e.g. Home Assistant)').fill('Alexa');
		await page.getByRole('checkbox', { name: 'Groceries' }).click();
		await page.getByRole('button', { name: 'Create token' }).click();

		await expect.element(page.getByText('Not an owner')).toBeInTheDocument();
	});

	it('shows a generic error message when creating a token fails without an ApiError', async () => {
		vi.mocked(createToken).mockRejectedValue(new TypeError('network down'));

		render(TokensPage);
		await page.getByPlaceholder('Name (e.g. Home Assistant)').fill('Alexa');
		await page.getByRole('checkbox', { name: 'Groceries' }).click();
		await page.getByRole('button', { name: 'Create token' }).click();

		await expect.element(page.getByText('Failed to create token.')).toBeInTheDocument();
	});

	it('asks for confirmation before revoking a token', async () => {
		vi.mocked(fetchTokens).mockResolvedValue([token({ id: 5, name: 'Home Assistant' })]);

		render(TokensPage);
		await page.getByRole('button', { name: 'Revoke' }).click();

		await expect.element(page.getByText('Revoke this token?')).toBeInTheDocument();
		expect(revokeToken).not.toHaveBeenCalled();
	});

	it('cancels revoking without calling the API', async () => {
		vi.mocked(fetchTokens).mockResolvedValue([token({ id: 5, name: 'Home Assistant' })]);

		render(TokensPage);
		await page.getByRole('button', { name: 'Revoke' }).click();
		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByText('Revoke this token?')).not.toBeInTheDocument();
		expect(revokeToken).not.toHaveBeenCalled();
	});

	it('revokes a token after confirming', async () => {
		vi.mocked(fetchTokens).mockResolvedValue([token({ id: 5, name: 'Home Assistant' })]);

		render(TokensPage);
		await expect.element(page.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Revoke' }).click();
		await page.getByRole('button', { name: 'Revoke' }).click();

		expect(revokeToken).toHaveBeenCalledWith(5);
	});

	it('reloads and restores the token when revoking fails', async () => {
		const existing = token({ id: 5, name: 'Home Assistant' });
		vi.mocked(fetchTokens).mockResolvedValueOnce([existing]).mockResolvedValueOnce([existing]);
		vi.mocked(revokeToken).mockRejectedValue(new Error('boom'));

		render(TokensPage);
		await expect.element(page.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Revoke' }).click();
		await page.getByRole('button', { name: 'Revoke' }).click();

		await expect.poll(() => vi.mocked(fetchTokens).mock.calls.length).toBe(2);
	});

	it('shows the ApiError message when revoking a token fails', async () => {
		const existing = token({ id: 5, name: 'Home Assistant' });
		let resolveReload: (tokens: (typeof existing)[]) => void = () => {};
		vi.mocked(fetchTokens)
			.mockResolvedValueOnce([existing])
			.mockImplementationOnce(() => new Promise((resolve) => (resolveReload = resolve)));
		vi.mocked(revokeToken).mockRejectedValue(new ApiError(500, 'Could not revoke token'));

		render(TokensPage);
		await expect.element(page.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Revoke' }).click();
		await page.getByRole('button', { name: 'Revoke' }).click();

		await expect.element(page.getByText('Could not revoke token')).toBeInTheDocument();
		resolveReload!([existing]);
	});

	it('opens the edit panel pre-filled with the token`s current lists and role', async () => {
		vi.mocked(fetchLists).mockResolvedValue([
			list({ id: 1, name: 'Groceries' }),
			list({ id: 2, name: 'Hardware Store' })
		]);
		vi.mocked(fetchTokens).mockResolvedValue([
			token({ id: 5, name: 'Home Assistant', grants: [{ listId: 1, role: 'viewer' }] })
		]);

		render(TokensPage);
		await page.getByRole('button', { name: 'Edit' }).click();

		await expect.element(page.getByRole('checkbox', { name: 'Groceries' }).nth(1)).toBeChecked();
		await expect
			.element(page.getByRole('checkbox', { name: 'Hardware Store' }).nth(1))
			.not.toBeChecked();
		await expect.element(page.getByRole('combobox', { name: 'Role' }).nth(1)).toHaveValue('viewer');
	});

	it('falls back to editor when a token has no grants at all', async () => {
		vi.mocked(fetchTokens).mockResolvedValue([token({ id: 5, grants: [] })]);

		render(TokensPage);
		await page.getByRole('button', { name: 'Edit' }).click();

		await expect.element(page.getByRole('combobox', { name: 'Role' }).nth(1)).toHaveValue('editor');
	});

	it('cancels editing without saving', async () => {
		vi.mocked(fetchTokens).mockResolvedValue([token({ id: 5, name: 'Home Assistant' })]);

		render(TokensPage);
		await page.getByRole('button', { name: 'Edit' }).click();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
		expect(updateToken).not.toHaveBeenCalled();
	});

	it('saves an edited token`s lists and role, leaving other tokens untouched', async () => {
		vi.mocked(fetchLists).mockResolvedValue([
			list({ id: 1, name: 'Groceries' }),
			list({ id: 2, name: 'Hardware Store' })
		]);
		vi.mocked(fetchTokens).mockResolvedValue([
			token({ id: 5, name: 'Home Assistant', grants: [{ listId: 1, role: 'editor' }] }),
			token({ id: 6, name: 'Alexa', grants: [{ listId: 2, role: 'viewer' }] })
		]);
		vi.mocked(updateToken).mockResolvedValue(
			token({
				id: 5,
				name: 'Home Assistant',
				grants: [{ listId: 2, role: 'viewer' }]
			})
		);

		render(TokensPage);
		await page.getByRole('button', { name: 'Edit' }).nth(0).click();
		await page.getByRole('checkbox', { name: 'Groceries' }).nth(1).click();
		await page.getByRole('checkbox', { name: 'Hardware Store' }).nth(1).click();
		await page.getByRole('combobox', { name: 'Role' }).nth(1).selectOptions('viewer');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateToken).toHaveBeenCalledWith(5, [2], 'viewer', 'Home Assistant');
		// Both the just-edited token and the untouched second token now show this
		// grant text — proves the edit didn't clobber the other list entry.
		await expect.poll(() => page.getByText('Hardware Store (viewer)').elements().length).toBe(2);
		await expect.element(page.getByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
	});

	it('shows the ApiError message when saving an edited token fails', async () => {
		vi.mocked(fetchTokens).mockResolvedValue([token({ id: 5, name: 'Home Assistant' })]);
		vi.mocked(updateToken).mockRejectedValue(new ApiError(403, 'Not an owner'));

		render(TokensPage);
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Not an owner')).toBeInTheDocument();
	});

	it('shows a generic error message when saving an edited token fails without an ApiError', async () => {
		vi.mocked(fetchTokens).mockResolvedValue([token({ id: 5, name: 'Home Assistant' })]);
		vi.mocked(updateToken).mockRejectedValue(new TypeError('network down'));

		render(TokensPage);
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to update token.')).toBeInTheDocument();
	});

	it('omits the name from the update payload when the token has none', async () => {
		vi.mocked(fetchTokens).mockResolvedValue([token({ id: 5, name: null })]);
		vi.mocked(updateToken).mockResolvedValue(token({ id: 5, name: null }));

		render(TokensPage);
		await page.getByRole('button', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateToken).toHaveBeenCalledWith(5, [1], 'editor', undefined);
	});

	it('disables Save once every list is unchecked', async () => {
		vi.mocked(fetchTokens).mockResolvedValue([token({ id: 5, name: 'Home Assistant' })]);

		render(TokensPage);
		await page.getByRole('button', { name: 'Edit' }).click();
		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeDisabled();

		await page.getByRole('checkbox', { name: 'Groceries' }).nth(1).click();

		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
	});
});
