import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/auth', () => ({ changePassword: vi.fn() }));

const { changePassword } = await import('$lib/api/auth');
const { goto } = await import('$app/navigation');
const ChangePasswordPage = (await import('./+page.svelte')).default;

describe('Change password +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(ChangePasswordPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	const user = {
		id: 1,
		email: 'user@example.com',
		fullName: null,
		initials: 'US',
		createdAt: '2026-08-01T00:00:00.000Z',
		updatedAt: null
	};

	it('submits the current and new password with the sign-out checkbox unchecked by default', async () => {
		vi.mocked(changePassword).mockResolvedValue(user);

		render(ChangePasswordPage);

		await page.getByLabelText('Current password').fill('oldpassword');
		await page.getByLabelText('New password', { exact: true }).fill('newpassword123');
		await page.getByLabelText('Confirm new password', { exact: true }).fill('newpassword123');
		await page.getByRole('button', { name: 'Change password' }).click();

		await expect.poll(() => vi.mocked(changePassword).mock.calls.length).toBe(1);
		expect(changePassword).toHaveBeenCalledWith({
			currentPassword: 'oldpassword',
			password: 'newpassword123',
			passwordConfirmation: 'newpassword123',
			signOutOtherDevices: false
		});
		await expect.element(page.getByText('Your password has been changed.')).toBeInTheDocument();
	});

	it('submits signOutOtherDevices: true when the checkbox is checked', async () => {
		vi.mocked(changePassword).mockResolvedValue(user);

		render(ChangePasswordPage);

		await page.getByLabelText('Current password').fill('oldpassword');
		await page.getByLabelText('New password', { exact: true }).fill('newpassword123');
		await page.getByLabelText('Confirm new password', { exact: true }).fill('newpassword123');
		await page.getByText('Sign out all other devices').click();
		await page.getByRole('button', { name: 'Change password' }).click();

		await expect.poll(() => vi.mocked(changePassword).mock.calls.length).toBe(1);
		expect(changePassword).toHaveBeenCalledWith({
			currentPassword: 'oldpassword',
			password: 'newpassword123',
			passwordConfirmation: 'newpassword123',
			signOutOtherDevices: true
		});
	});

	it('shows the API error message on failure', async () => {
		vi.mocked(changePassword).mockRejectedValue(
			new ApiError(400, 'Current password is incorrect.')
		);

		render(ChangePasswordPage);

		await page.getByLabelText('Current password').fill('wrongpassword');
		await page.getByLabelText('New password', { exact: true }).fill('newpassword123');
		await page.getByLabelText('Confirm new password', { exact: true }).fill('newpassword123');
		await page.getByRole('button', { name: 'Change password' }).click();

		await expect.element(page.getByText('Current password is incorrect.')).toBeInTheDocument();
		expect(changePassword).toHaveBeenCalled();
	});

	it('shows a generic error message on failure without an ApiError', async () => {
		vi.mocked(changePassword).mockRejectedValue(new TypeError('network down'));

		render(ChangePasswordPage);

		await page.getByLabelText('Current password').fill('oldpassword');
		await page.getByLabelText('New password', { exact: true }).fill('newpassword123');
		await page.getByLabelText('Confirm new password', { exact: true }).fill('newpassword123');
		await page.getByRole('button', { name: 'Change password' }).click();

		await expect
			.element(page.getByText('Something went wrong. Please try again.'))
			.toBeInTheDocument();
		expect(changePassword).toHaveBeenCalled();
	});
});
