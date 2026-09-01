import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ApiError } from '$lib/api/client';

const mockPageState = vi.hoisted(() => ({ url: { searchParams: new URLSearchParams() } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: mockPageState }));
vi.mock('$lib/api/auth', () => ({ login: vi.fn() }));
vi.mock('$lib/api/meta', () => ({ fetchMeta: vi.fn() }));

const { goto } = await import('$app/navigation');
const { login } = await import('$lib/api/auth');
const { fetchMeta } = await import('$lib/api/meta');
const LoginPage = (await import('./+page.svelte')).default;

describe('Login +page.svelte', () => {
	beforeEach(() => {
		mockPageState.url.searchParams = new URLSearchParams();
		vi.mocked(goto).mockResolvedValue(undefined);
		vi.mocked(fetchMeta).mockResolvedValue({
			version: 'nightly',
			commit: 'abc123',
			builtAt: '2026-08-01T00:00:00.000Z',
			publicSignupEnabled: true
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('logs in and navigates to /lists', async () => {
		vi.mocked(login).mockResolvedValue({
			user: {
				id: 1,
				email: 'a@example.com',
				fullName: null,
				initials: 'A',
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null
			},
			token: 'tok'
		});

		render(LoginPage);

		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByLabelText('Password').fill('password123');
		await page.getByRole('button', { name: 'Log in' }).click();

		await expect.poll(() => vi.mocked(login).mock.calls.length).toBe(1);
		expect(login).toHaveBeenCalledWith({ email: 'a@example.com', password: 'password123' });
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/lists');
	});

	it('redirects to the next path after login when present', async () => {
		mockPageState.url.searchParams = new URLSearchParams({ next: '/join/abc123' });
		vi.mocked(login).mockResolvedValue({
			user: {
				id: 1,
				email: 'a@example.com',
				fullName: null,
				initials: 'A',
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null
			},
			token: 'tok'
		});

		render(LoginPage);

		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByLabelText('Password').fill('password123');
		await page.getByRole('button', { name: 'Log in' }).click();

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/join/abc123');
	});

	it('carries the next param forward to the sign up link', async () => {
		mockPageState.url.searchParams = new URLSearchParams({ next: '/join/abc123' });

		render(LoginPage);

		const link = page.getByRole('link', { name: 'Sign up' }).element() as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('/signup?next=%2Fjoin%2Fabc123');
	});

	it('hides the sign up link when public signup is disabled', async () => {
		vi.mocked(fetchMeta).mockResolvedValue({
			version: 'nightly',
			commit: 'abc123',
			builtAt: '2026-08-01T00:00:00.000Z',
			publicSignupEnabled: false
		});

		render(LoginPage);

		await expect.poll(() => vi.mocked(fetchMeta).mock.calls.length).toBe(1);
		await expect.element(page.getByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
	});

	it('keeps showing the sign up link when the meta fetch fails', async () => {
		vi.mocked(fetchMeta).mockRejectedValue(new Error('network down'));

		render(LoginPage);

		await expect.poll(() => vi.mocked(fetchMeta).mock.calls.length).toBe(1);
		await expect.element(page.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
	});

	it('links to the forgot password page', async () => {
		render(LoginPage);

		const link = page
			.getByRole('link', { name: 'Forgot password?' })
			.element() as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('/forgot-password');
	});

	it('shows the API error message on failure', async () => {
		vi.mocked(login).mockRejectedValue(new ApiError(401, 'Invalid credentials'));

		render(LoginPage);

		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByLabelText('Password').fill('wrong-password');
		await page.getByRole('button', { name: 'Log in' }).click();

		await expect.element(page.getByText('Invalid credentials')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	it('shows a generic error message on failure without an ApiError', async () => {
		vi.mocked(login).mockRejectedValue(new TypeError('network down'));

		render(LoginPage);

		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByLabelText('Password').fill('wrong-password');
		await page.getByRole('button', { name: 'Log in' }).click();

		await expect
			.element(page.getByText('Something went wrong. Please try again.'))
			.toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});
});
