import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { token: 'abc123' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/invites', () => ({
	fetchInvitePreview: vi.fn(),
	acceptInvite: vi.fn()
}));

const { fetchInvitePreview, acceptInvite } = await import('$lib/api/invites');
const { goto } = await import('$app/navigation');
const JoinPage = (await import('./+page.svelte')).default;

const preview = { listName: 'Groceries', inviterName: 'Ada Lovelace', role: 'editor' as const };

describe('Join +page.svelte', () => {
	beforeEach(() => {
		vi.mocked(fetchInvitePreview).mockResolvedValue(preview);
		vi.mocked(goto).mockResolvedValue(undefined);
		clearToken();
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('shows an error message when the preview fails without an ApiError', async () => {
		vi.mocked(fetchInvitePreview).mockRejectedValue(new TypeError('network down'));

		render(JoinPage);

		await expect
			.element(page.getByText('This invite link is invalid or expired.'))
			.toBeInTheDocument();
	});

	it('shows the ApiError message when the preview fails', async () => {
		vi.mocked(fetchInvitePreview).mockRejectedValue(new ApiError(404, 'Invite not found'));

		render(JoinPage);

		await expect.element(page.getByText('Invite not found')).toBeInTheDocument();
	});

	it('shows login/signup links when logged out', async () => {
		render(JoinPage);

		await expect.element(page.getByText('Groceries', { exact: false })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
	});

	it('carries the join path forward as the next param on both links', async () => {
		render(JoinPage);
		await expect.element(page.getByRole('link', { name: 'Log in' })).toBeInTheDocument();

		const login = page.getByRole('link', { name: 'Log in' }).element() as HTMLAnchorElement;
		const signup = page.getByRole('link', { name: 'Sign up' }).element() as HTMLAnchorElement;
		expect(login.getAttribute('href')).toBe('/login?next=%2Fjoin%2Fabc123');
		expect(signup.getAttribute('href')).toBe('/signup?next=%2Fjoin%2Fabc123');
	});

	it('accepts the invite and navigates to the list when logged in', async () => {
		setToken('test-token');
		vi.mocked(acceptInvite).mockResolvedValue({
			id: 5,
			name: 'Groceries',
			color: '#3b82f6',
			icon: null,
			ownerId: 1,
			archived: false,
			itemCount: 0,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null
		});

		render(JoinPage);
		await expect
			.element(page.getByRole('button', { name: 'Accept & open list' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Accept & open list' }).click();

		expect(acceptInvite).toHaveBeenCalledWith('abc123');
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/lists/5');
	});

	it('shows a generic error message when accepting fails without an ApiError', async () => {
		setToken('test-token');
		vi.mocked(acceptInvite).mockRejectedValue(new TypeError('network down'));

		render(JoinPage);
		await expect
			.element(page.getByRole('button', { name: 'Accept & open list' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Accept & open list' }).click();

		await expect.element(page.getByText('Failed to accept the invite.')).toBeInTheDocument();
	});

	it('shows the ApiError message when accepting fails', async () => {
		setToken('test-token');
		vi.mocked(acceptInvite).mockRejectedValue(new ApiError(404, 'Invite not found'));

		render(JoinPage);
		await expect
			.element(page.getByRole('button', { name: 'Accept & open list' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Accept & open list' }).click();

		await expect.element(page.getByText('Invite not found')).toBeInTheDocument();
	});
});
