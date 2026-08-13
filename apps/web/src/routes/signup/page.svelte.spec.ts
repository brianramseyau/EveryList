import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/auth', () => ({ signup: vi.fn() }));

const { goto } = await import('$app/navigation');
const { signup } = await import('$lib/api/auth');
const SignupPage = (await import('./+page.svelte')).default;

describe('Signup +page.svelte', () => {
	beforeEach(() => {
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
});
