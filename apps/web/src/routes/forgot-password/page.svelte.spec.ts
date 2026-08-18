import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ApiError } from '$lib/api/client';

vi.mock('$lib/api/auth', () => ({ forgotPassword: vi.fn() }));

const { forgotPassword } = await import('$lib/api/auth');
const ForgotPasswordPage = (await import('./+page.svelte')).default;

describe('ForgotPassword +page.svelte', () => {
	beforeEach(() => {
		vi.mocked(forgotPassword).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('submits the email and shows the confirmation message', async () => {
		render(ForgotPasswordPage);

		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByRole('button', { name: 'Send reset link' }).click();

		await expect.poll(() => vi.mocked(forgotPassword).mock.calls.length).toBe(1);
		expect(forgotPassword).toHaveBeenCalledWith({ email: 'a@example.com' });
		await expect
			.element(page.getByText(/If an account exists for a@example\.com/))
			.toBeInTheDocument();
	});

	it('shows the API error message on failure', async () => {
		vi.mocked(forgotPassword).mockRejectedValue(
			new ApiError(503, 'Email is not configured on this server.')
		);

		render(ForgotPasswordPage);

		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByRole('button', { name: 'Send reset link' }).click();

		await expect
			.element(page.getByText('Email is not configured on this server.'))
			.toBeInTheDocument();
		expect(forgotPassword).toHaveBeenCalled();
	});

	it('shows a generic error message on failure without an ApiError', async () => {
		vi.mocked(forgotPassword).mockRejectedValue(new TypeError('network down'));

		render(ForgotPasswordPage);

		await page.getByLabelText('Email').fill('a@example.com');
		await page.getByRole('button', { name: 'Send reset link' }).click();

		await expect
			.element(page.getByText('Something went wrong. Please try again.'))
			.toBeInTheDocument();
		expect(forgotPassword).toHaveBeenCalled();
	});

	it('links back to the log in page', async () => {
		render(ForgotPasswordPage);

		const link = page.getByRole('link', { name: 'Log in' }).element() as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('/login');
	});
});
