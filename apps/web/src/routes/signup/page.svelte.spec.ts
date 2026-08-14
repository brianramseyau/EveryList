import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ApiError } from '$lib/api/client';

const mockPageState = vi.hoisted(() => ({ url: { searchParams: new URLSearchParams() } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: mockPageState }));
vi.mock('$lib/api/auth', () => ({ signup: vi.fn() }));

const { goto } = await import('$app/navigation');
const { signup } = await import('$lib/api/auth');
const SignupPage = (await import('./+page.svelte')).default;

describe('Signup +page.svelte', () => {
	beforeEach(() => {
		mockPageState.url.searchParams = new URLSearchParams();
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('signs up, trims an empty name to null, and navigates to /lists', async () => {
		vi.mocked(signup).mockResolvedValue({
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

		render(SignupPage);

		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByLabelText('Password', { exact: true }).fill('password123');
		await page.getByLabelText('Confirm password').fill('password123');
		await page.getByRole('button', { name: 'Sign up' }).click();

		await expect.poll(() => vi.mocked(signup).mock.calls.length).toBe(1);
		expect(signup).toHaveBeenCalledWith({
			fullName: null,
			email: 'a@example.com',
			password: 'password123',
			passwordConfirmation: 'password123'
		});
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/lists');
	});

	it('redirects to the next path after signup when present', async () => {
		mockPageState.url.searchParams = new URLSearchParams({ next: '/join/abc123' });
		vi.mocked(signup).mockResolvedValue({
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

		render(SignupPage);

		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByLabelText('Password', { exact: true }).fill('password123');
		await page.getByLabelText('Confirm password').fill('password123');
		await page.getByRole('button', { name: 'Sign up' }).click();

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/join/abc123');
	});

	it('carries the next param forward to the log in link', async () => {
		mockPageState.url.searchParams = new URLSearchParams({ next: '/join/abc123' });

		render(SignupPage);

		const link = page.getByRole('link', { name: 'Log in' }).element() as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('/login?next=%2Fjoin%2Fabc123');
	});

	it('trims and forwards a filled-in name', async () => {
		vi.mocked(signup).mockResolvedValue({
			user: {
				id: 1,
				email: 'a@example.com',
				fullName: 'Ada Lovelace',
				initials: 'AL',
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null
			},
			token: 'tok'
		});

		render(SignupPage);

		await page.getByLabelText('Name (optional)').fill('  Ada Lovelace  ');
		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByLabelText('Password', { exact: true }).fill('password123');
		await page.getByLabelText('Confirm password').fill('password123');
		await page.getByRole('button', { name: 'Sign up' }).click();

		await expect.poll(() => vi.mocked(signup).mock.calls.length).toBe(1);
		expect(signup).toHaveBeenCalledWith({
			fullName: 'Ada Lovelace',
			email: 'a@example.com',
			password: 'password123',
			passwordConfirmation: 'password123'
		});
	});

	it('shows the API error message on failure', async () => {
		vi.mocked(signup).mockRejectedValue(new ApiError(422, 'Email already in use'));

		render(SignupPage);

		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByLabelText('Password', { exact: true }).fill('password123');
		await page.getByLabelText('Confirm password').fill('password123');
		await page.getByRole('button', { name: 'Sign up' }).click();

		await expect.element(page.getByText('Email already in use')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	it('shows a generic error message on failure without an ApiError', async () => {
		vi.mocked(signup).mockRejectedValue(new TypeError('network down'));

		render(SignupPage);

		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByLabelText('Password', { exact: true }).fill('password123');
		await page.getByLabelText('Confirm password').fill('password123');
		await page.getByRole('button', { name: 'Sign up' }).click();

		await expect
			.element(page.getByText('Something went wrong. Please try again.'))
			.toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});
});
