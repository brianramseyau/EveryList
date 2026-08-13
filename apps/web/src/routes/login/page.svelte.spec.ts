import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/auth', () => ({ login: vi.fn() }));

const { goto } = await import('$app/navigation');
const { login } = await import('$lib/api/auth');
const LoginPage = (await import('./+page.svelte')).default;

describe('Login +page.svelte', () => {
	beforeEach(() => {
		vi.mocked(goto).mockResolvedValue(undefined);
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
});
