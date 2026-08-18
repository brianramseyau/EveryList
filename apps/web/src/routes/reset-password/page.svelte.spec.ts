import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ApiError } from '$lib/api/client';

const mockPageState = vi.hoisted(() => ({ url: { searchParams: new URLSearchParams() } }));
vi.mock('$app/state', () => ({ page: mockPageState }));
vi.mock('$lib/api/auth', () => ({ resetPassword: vi.fn() }));

const { resetPassword } = await import('$lib/api/auth');
const ResetPasswordPage = (await import('./+page.svelte')).default;

describe('ResetPassword +page.svelte', () => {
	beforeEach(() => {
		mockPageState.url.searchParams = new URLSearchParams({ token: 'tok-123' });
		vi.mocked(resetPassword).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('submits the token and new password, then shows the success message', async () => {
		render(ResetPasswordPage);

		await page.getByLabelText('New password', { exact: true }).fill('newpassword123');
		await page.getByLabelText('Confirm new password', { exact: true }).fill('newpassword123');
		await page.getByRole('button', { name: 'Reset password' }).click();

		await expect.poll(() => vi.mocked(resetPassword).mock.calls.length).toBe(1);
		expect(resetPassword).toHaveBeenCalledWith({
			token: 'tok-123',
			password: 'newpassword123',
			passwordConfirmation: 'newpassword123'
		});
		await expect.element(page.getByText('Your password has been reset.')).toBeInTheDocument();
	});

	it('shows the invalid-link message when no token is present', async () => {
		mockPageState.url.searchParams = new URLSearchParams();

		render(ResetPasswordPage);

		await expect
			.element(page.getByText('This password reset link is invalid or has expired.'))
			.toBeInTheDocument();
		expect(page.getByRole('button', { name: 'Reset password' }).query()).toBeNull();
	});

	it('shows the API error message on failure', async () => {
		vi.mocked(resetPassword).mockRejectedValue(
			new ApiError(400, 'This reset link is invalid or has expired.')
		);

		render(ResetPasswordPage);

		await page.getByLabelText('New password', { exact: true }).fill('newpassword123');
		await page.getByLabelText('Confirm new password', { exact: true }).fill('newpassword123');
		await page.getByRole('button', { name: 'Reset password' }).click();

		await expect
			.element(page.getByText('This reset link is invalid or has expired.'))
			.toBeInTheDocument();
		expect(resetPassword).toHaveBeenCalled();
	});

	it('shows a generic error message on failure without an ApiError', async () => {
		vi.mocked(resetPassword).mockRejectedValue(new TypeError('network down'));

		render(ResetPasswordPage);

		await page.getByLabelText('New password', { exact: true }).fill('newpassword123');
		await page.getByLabelText('Confirm new password', { exact: true }).fill('newpassword123');
		await page.getByRole('button', { name: 'Reset password' }).click();

		await expect
			.element(page.getByText('Something went wrong. Please try again.'))
			.toBeInTheDocument();
		expect(resetPassword).toHaveBeenCalled();
	});

	it('links to log in after a successful reset', async () => {
		render(ResetPasswordPage);

		await page.getByLabelText('New password', { exact: true }).fill('newpassword123');
		await page.getByLabelText('Confirm new password', { exact: true }).fill('newpassword123');
		await page.getByRole('button', { name: 'Reset password' }).click();

		await expect.element(page.getByText('Your password has been reset.')).toBeInTheDocument();
		const link = page.getByRole('link', { name: 'Log in' }).element() as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('/login');
	});
});
