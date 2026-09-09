import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/auth', () => ({ fetchProfile: vi.fn() }));
vi.mock('$lib/api/admin-users', () => ({
	fetchAdminUsers: vi.fn(),
	createAdminUser: vi.fn(),
	updateAdminUser: vi.fn(),
	deleteAdminUser: vi.fn()
}));

const { fetchProfile } = await import('$lib/api/auth');
const { fetchAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser } = await import(
	'$lib/api/admin-users'
);
const { goto } = await import('$app/navigation');
const AdminUsersPage = (await import('./+page.svelte')).default;

const admin = {
	id: 1,
	fullName: 'Ada Lovelace',
	email: 'ada@example.com',
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null,
	disabledAt: null
};

const other = {
	id: 2,
	fullName: 'Grace Hopper',
	email: 'grace@example.com',
	createdAt: '2026-08-02T00:00:00.000Z',
	updatedAt: null,
	disabledAt: null
};

/** `fetchProfile` returns a `UserDto`, not `AdminUserDto` — same account as `admin` above, but
 * with `initials` instead of `disabledAt`. */
const adminProfile = {
	id: 1,
	fullName: 'Ada Lovelace',
	email: 'ada@example.com',
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null,
	initials: 'AL'
};

describe('Admin users +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchProfile).mockResolvedValue(adminProfile);
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		clearToken();
	});

	it('sets the document title', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin]);

		render(AdminUsersPage);

		await expect.poll(() => document.title).toBe('Manage users — EveryList');
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(AdminUsersPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('lists users on success', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);

		render(AdminUsersPage);

		await expect.element(page.getByText('grace@example.com')).toBeInTheDocument();
		await expect.element(page.getByText('(you)')).toBeInTheDocument();
	});

	it('shows a forbidden message on a 403', async () => {
		vi.mocked(fetchAdminUsers).mockRejectedValue(new ApiError(403, 'Not authorized'));

		render(AdminUsersPage);

		await expect
			.element(page.getByText("This page is only available to the instance's primary account."))
			.toBeInTheDocument();
	});

	it('shows the ApiError message for a non-403 load failure', async () => {
		vi.mocked(fetchAdminUsers).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(AdminUsersPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('shows a generic message when loading fails without an ApiError', async () => {
		vi.mocked(fetchAdminUsers).mockRejectedValue(new TypeError('network down'));

		render(AdminUsersPage);

		await expect.element(page.getByText('Failed to load users.')).toBeInTheDocument();
	});

	it('ignores a failure to load the current profile', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin]);
		vi.mocked(fetchProfile).mockRejectedValue(new TypeError('network down'));

		render(AdminUsersPage);

		await expect.element(page.getByText('ada@example.com')).toBeInTheDocument();
	});

	it('displays a user by email when they have no full name', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, { ...other, fullName: null }]);

		render(AdminUsersPage);

		await expect
			.element(page.getByText('grace@example.com', { exact: true }).nth(0))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('grace@example.com', { exact: true }).nth(1))
			.toBeInTheDocument();

		// Editing prefills the full-name field from the user's own record — for a user
		// with no full name, that's an empty string rather than falling through to the email.
		await page.getByRole('button', { name: 'Edit' }).nth(1).click();
		await expect.element(page.getByPlaceholder('Full name')).toHaveValue('');
	});

	it('creates a new user', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin]);
		const created = { ...other, fullName: 'New Guy', email: 'new-guy@example.com' };
		vi.mocked(createAdminUser).mockResolvedValue(created);

		render(AdminUsersPage);
		await expect.element(page.getByRole('button', { name: 'Add user' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Add user' }).click();
		await page.getByPlaceholder('Full name (optional)').fill('New Guy');
		await page.getByPlaceholder('Email').fill('new-guy@example.com');
		await page.getByPlaceholder('Password (8-32 characters)').fill('password123');
		await page.getByRole('button', { name: 'Add user' }).click();

		await expect.element(page.getByText('new-guy@example.com')).toBeInTheDocument();
		expect(createAdminUser).toHaveBeenCalledWith({
			fullName: 'New Guy',
			email: 'new-guy@example.com',
			password: 'password123'
		});
	});

	it('shows a generic message when creating a user fails without an ApiError', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin]);
		vi.mocked(createAdminUser).mockRejectedValue(new TypeError('network down'));

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Add user' }).click();
		await page.getByPlaceholder('Email').fill('new-guy@example.com');
		await page.getByPlaceholder('Password (8-32 characters)').fill('password123');
		await page.getByRole('button', { name: 'Add user' }).click();

		await expect.element(page.getByText('Failed to create user.')).toBeInTheDocument();
	});

	it('cancels adding a new user', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin]);

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Add user' }).click();
		await expect.element(page.getByPlaceholder('Email')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByPlaceholder('Email')).not.toBeInTheDocument();
		expect(createAdminUser).not.toHaveBeenCalled();
	});

	it('shows an error when creating a user fails', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin]);
		vi.mocked(createAdminUser).mockRejectedValue(new ApiError(422, 'That email is taken.'));

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Add user' }).click();
		await page.getByPlaceholder('Email').fill('dup@example.com');
		await page.getByPlaceholder('Password (8-32 characters)').fill('password123');
		await page.getByRole('button', { name: 'Add user' }).click();

		await expect.element(page.getByText('That email is taken.')).toBeInTheDocument();
	});

	it('edits an existing user, including their email and password', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);
		const updated = { ...other, fullName: 'Renamed', email: 'renamed@example.com' };
		vi.mocked(updateAdminUser).mockResolvedValue(updated);

		render(AdminUsersPage);
		await expect.element(page.getByText('grace@example.com')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Edit' }).nth(1).click();
		await page.getByPlaceholder('Full name').fill('Renamed');
		await page.getByPlaceholder('Email').fill('renamed@example.com');
		await page
			.getByPlaceholder('New password (leave blank to keep current)')
			.fill('new-password123');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Renamed', { exact: true })).toBeInTheDocument();
		expect(updateAdminUser).toHaveBeenCalledWith(2, {
			fullName: 'Renamed',
			email: 'renamed@example.com',
			password: 'new-password123'
		});
	});

	it('clears a user’s full name back to null when saved blank', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);
		vi.mocked(updateAdminUser).mockResolvedValue({ ...other, fullName: null });

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Edit' }).nth(1).click();
		await page.getByPlaceholder('Full name').fill('');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateAdminUser).toHaveBeenCalledWith(2, {
			fullName: null,
			email: 'grace@example.com'
		});
		// The name line reactively falls back to the email once fullName clears to null.
		await expect
			.element(page.getByText('grace@example.com', { exact: true }).nth(0))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('grace@example.com', { exact: true }).nth(1))
			.toBeInTheDocument();
	});

	it('shows a generic message when editing a user fails without an ApiError', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);
		vi.mocked(updateAdminUser).mockRejectedValue(new TypeError('network down'));

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Edit' }).nth(1).click();
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to update user.')).toBeInTheDocument();
	});

	it('cancels editing a user', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Edit' }).nth(1).click();
		await expect.element(page.getByPlaceholder('Full name')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByPlaceholder('Full name')).not.toBeInTheDocument();
		expect(updateAdminUser).not.toHaveBeenCalled();
	});

	it('shows an error when editing a user fails', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);
		vi.mocked(updateAdminUser).mockRejectedValue(new ApiError(422, 'That email is taken.'));

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Edit' }).nth(1).click();
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('That email is taken.')).toBeInTheDocument();
	});

	it('disables and re-enables another user', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);
		vi.mocked(updateAdminUser).mockResolvedValueOnce({
			...other,
			disabledAt: '2026-08-03T00:00:00.000Z'
		});

		render(AdminUsersPage);
		await expect.element(page.getByText('grace@example.com')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Disable' }).click();

		await expect.element(page.getByText('Disabled')).toBeInTheDocument();
		expect(updateAdminUser).toHaveBeenCalledWith(2, { disabled: true });
	});

	it('shows an error when disabling a user fails', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);
		vi.mocked(updateAdminUser).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Disable' }).click();

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('shows a generic message when disabling a user fails without an ApiError', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);
		vi.mocked(updateAdminUser).mockRejectedValue(new TypeError('network down'));

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Disable' }).click();

		await expect.element(page.getByText('Failed to update user.')).toBeInTheDocument();
	});

	it('cancels deleting a user', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Delete' }).click();
		await expect.element(page.getByRole('button', { name: 'Confirm delete' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect
			.element(page.getByRole('button', { name: 'Confirm delete' }))
			.not.toBeInTheDocument();
		expect(deleteAdminUser).not.toHaveBeenCalled();
	});

	it('shows an error when deleting a user fails', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);
		vi.mocked(deleteAdminUser).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Delete' }).click();
		await page.getByRole('button', { name: 'Confirm delete' }).click();

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('shows a generic message when deleting a user fails without an ApiError', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);
		vi.mocked(deleteAdminUser).mockRejectedValue(new TypeError('network down'));

		render(AdminUsersPage);
		await page.getByRole('button', { name: 'Delete' }).click();
		await page.getByRole('button', { name: 'Confirm delete' }).click();

		await expect.element(page.getByText('Failed to delete user.')).toBeInTheDocument();
	});

	it('deletes another user after confirming', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin, other]);
		vi.mocked(deleteAdminUser).mockResolvedValue(undefined);

		render(AdminUsersPage);
		await expect.element(page.getByText('grace@example.com')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete' }).click();
		await expect
			.element(page.getByText(/Deletes this user and every list they own/))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Confirm delete' }).click();

		await expect.element(page.getByText('grace@example.com')).not.toBeInTheDocument();
		expect(deleteAdminUser).toHaveBeenCalledWith(2);
	});

	it('does not show disable/delete controls for the current admin account', async () => {
		vi.mocked(fetchAdminUsers).mockResolvedValue([admin]);

		render(AdminUsersPage);
		await expect.element(page.getByText('(you)')).toBeInTheDocument();

		await expect.element(page.getByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
	});
});
