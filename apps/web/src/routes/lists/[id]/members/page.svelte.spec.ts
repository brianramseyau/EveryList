import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '5' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/auth', () => ({ fetchProfile: vi.fn() }));
vi.mock('$lib/api/members', () => ({
	fetchMembers: vi.fn(),
	fetchMemberCandidates: vi.fn(),
	addMember: vi.fn(),
	updateMemberRole: vi.fn(),
	removeMember: vi.fn()
}));
vi.mock('$lib/api/invites', () => ({
	fetchInvites: vi.fn(),
	createInvite: vi.fn(),
	revokeInvite: vi.fn()
}));

const { fetchList } = await import('$lib/api/lists');
const { fetchProfile } = await import('$lib/api/auth');
const { fetchMembers, fetchMemberCandidates, addMember, updateMemberRole, removeMember } =
	await import('$lib/api/members');
const { fetchInvites, createInvite, revokeInvite } = await import('$lib/api/invites');
const { goto } = await import('$app/navigation');
const MembersPage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

const groceries = {
	id: 5,
	name: 'Groceries',
	color: '#3b82f6',
	icon: null,
	ownerId: 1,
	folderId: null,
	badgeExcluded: false,
	passcodeHash: null,
	archived: false,
	itemCount: 0,
	createdAt: TS,
	updatedAt: null,
	version: 1
};

const ownerUser = {
	id: 1,
	fullName: 'Ada Lovelace',
	email: 'ada@example.com',
	createdAt: TS,
	updatedAt: null,
	initials: 'AL'
};
const editorUser = {
	id: 2,
	fullName: null,
	email: 'ed@example.com',
	createdAt: TS,
	updatedAt: null,
	initials: 'ED'
};

const ownerMember = {
	id: 10,
	listId: 5,
	userId: 1,
	role: 'owner' as const,
	invitedAt: TS,
	acceptedAt: TS,
	user: ownerUser
};
const editorMember = {
	id: 11,
	listId: 5,
	userId: 2,
	role: 'editor' as const,
	invitedAt: TS,
	acceptedAt: TS,
	user: editorUser
};
const viewerUser = {
	id: 3,
	fullName: 'Carol Danvers',
	email: 'carol@example.com',
	createdAt: TS,
	updatedAt: null,
	initials: 'CD'
};
const viewerMember = {
	id: 12,
	listId: 5,
	userId: 3,
	role: 'viewer' as const,
	invitedAt: TS,
	acceptedAt: TS,
	user: viewerUser
};

describe('Members +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(groceries);
		vi.mocked(fetchProfile).mockResolvedValue(ownerUser);
		vi.mocked(fetchMembers).mockResolvedValue([ownerMember, editorMember]);
		vi.mocked(fetchMemberCandidates).mockResolvedValue([]);
		vi.mocked(fetchInvites).mockResolvedValue([]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(MembersPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchMembers).mockRejectedValue(new TypeError('network down'));

		render(MembersPage);

		await expect.element(page.getByText('Failed to load members.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchMembers).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(MembersPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('links back to List Settings, not the list view', async () => {
		render(MembersPage);

		await expect.element(page.getByText('Groceries — Members')).toBeInTheDocument();
		const backLink = page.getByRole('link', { name: 'Back to settings' });
		await expect.element(backLink).toBeInTheDocument();
		expect(backLink.element().getAttribute('href')).toBe('/lists/5/settings');
	});

	it('lists members and lets an owner change a role', async () => {
		vi.mocked(fetchMembers).mockResolvedValue([ownerMember, editorMember, viewerMember]);
		vi.mocked(updateMemberRole).mockResolvedValue({ ...editorMember, role: 'viewer' });

		render(MembersPage);
		await expect.element(page.getByText('ed@example.com').first()).toBeInTheDocument();

		await page.getByRole('combobox').nth(0).selectOptions('viewer');

		expect(updateMemberRole).toHaveBeenCalledWith(5, 11, 'viewer');
	});

	it('lets an owner promote a viewer to editor', async () => {
		vi.mocked(fetchMembers).mockResolvedValue([ownerMember, editorMember, viewerMember]);
		vi.mocked(updateMemberRole).mockResolvedValue({ ...viewerMember, role: 'editor' });

		render(MembersPage);
		await expect.element(page.getByText('carol@example.com').first()).toBeInTheDocument();

		await page.getByRole('combobox').nth(1).selectOptions('editor');

		expect(updateMemberRole).toHaveBeenCalledWith(5, 12, 'editor');
	});

	it('shows an error message when changing a role fails', async () => {
		vi.mocked(updateMemberRole).mockRejectedValue(new ApiError(400, 'Must have an owner'));

		render(MembersPage);
		await expect.element(page.getByText('ed@example.com').first()).toBeInTheDocument();

		await page.getByRole('combobox').nth(0).selectOptions('viewer');

		await expect.element(page.getByText('Must have an owner')).toBeInTheDocument();
	});

	it('shows a generic error message when changing a role fails without an ApiError', async () => {
		vi.mocked(updateMemberRole).mockRejectedValue(new TypeError('network down'));

		render(MembersPage);
		await expect.element(page.getByText('ed@example.com').first()).toBeInTheDocument();

		await page.getByRole('combobox').nth(0).selectOptions('viewer');

		await expect.element(page.getByText('Failed to update member role.')).toBeInTheDocument();
	});

	it('lets an owner remove a member', async () => {
		render(MembersPage);
		await expect.element(page.getByText('ed@example.com').first()).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		expect(removeMember).toHaveBeenCalledWith(5, 11);
		await expect.element(page.getByText('ed@example.com').first()).not.toBeInTheDocument();
	});

	it('shows an error message when removing a member fails', async () => {
		vi.mocked(removeMember).mockRejectedValue(new ApiError(400, 'Must have an owner'));

		render(MembersPage);
		await expect.element(page.getByText('ed@example.com').first()).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect.element(page.getByText('Must have an owner')).toBeInTheDocument();
	});

	it('shows a generic error message when removing a member fails without an ApiError', async () => {
		vi.mocked(removeMember).mockRejectedValue(new TypeError('network down'));

		render(MembersPage);
		await expect.element(page.getByText('ed@example.com').first()).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect.element(page.getByText('Failed to remove member.')).toBeInTheDocument();
	});

	it('shows a non-owner a read-only role instead of controls', async () => {
		vi.mocked(fetchProfile).mockResolvedValue(editorUser);

		render(MembersPage);
		await expect.element(page.getByText('ed@example.com').first()).toBeInTheDocument();

		await expect.element(page.getByRole('combobox')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
		await expect.element(page.getByText('Invite by link')).not.toBeInTheDocument();
	});

	it('creates an invite link and shows it', async () => {
		vi.mocked(createInvite).mockResolvedValue({
			id: 20,
			listId: 5,
			token: 'tok-abc',
			role: 'editor',
			createdBy: 1,
			expiresAt: null,
			revokedAt: null,
			createdAt: TS
		});

		render(MembersPage);
		await expect.element(page.getByText('Invite by link')).toBeInTheDocument();

		await page.getByRole('combobox').nth(1).selectOptions('viewer');
		await page.getByRole('button', { name: 'Create invite link' }).click();

		expect(createInvite).toHaveBeenCalledWith(5, 'viewer');
		await expect.element(page.getByText('/join/tok-abc')).toBeInTheDocument();
	});

	it('shows an error message when creating an invite fails', async () => {
		vi.mocked(createInvite).mockRejectedValue(new ApiError(500, 'Could not create invite'));

		render(MembersPage);
		await expect.element(page.getByText('Invite by link')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Create invite link' }).click();

		await expect.element(page.getByText('Could not create invite')).toBeInTheDocument();
	});

	it('shows a generic error message when creating an invite fails without an ApiError', async () => {
		vi.mocked(createInvite).mockRejectedValue(new TypeError('network down'));

		render(MembersPage);
		await expect.element(page.getByText('Invite by link')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Create invite link' }).click();

		await expect.element(page.getByText('Failed to create invite.')).toBeInTheDocument();
	});

	it('lists and revokes an existing invite', async () => {
		vi.mocked(fetchInvites).mockResolvedValue([
			{
				id: 21,
				listId: 5,
				token: 'tok-xyz',
				role: 'viewer',
				createdBy: 1,
				expiresAt: null,
				revokedAt: null,
				createdAt: TS
			}
		]);

		render(MembersPage);
		await expect.element(page.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Revoke' }).click();

		expect(revokeInvite).toHaveBeenCalledWith(5, 21);
	});

	it('reloads and restores the invite when revoking fails', async () => {
		const invite = {
			id: 21,
			listId: 5,
			token: 'tok-xyz',
			role: 'viewer' as const,
			createdBy: 1,
			expiresAt: null,
			revokedAt: null,
			createdAt: TS
		};
		vi.mocked(fetchInvites).mockResolvedValueOnce([invite]).mockResolvedValueOnce([invite]);
		vi.mocked(revokeInvite).mockRejectedValue(new Error('boom'));

		render(MembersPage);
		await expect.element(page.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Revoke' }).click();

		await expect.poll(() => vi.mocked(fetchInvites).mock.calls.length).toBe(2);
	});

	it('shows the ApiError message when revoking an invite fails', async () => {
		const invite = {
			id: 21,
			listId: 5,
			token: 'tok-xyz',
			role: 'viewer' as const,
			createdBy: 1,
			expiresAt: null,
			revokedAt: null,
			createdAt: TS
		};
		// The catch sets the ApiError message and then triggers a reload, which
		// on success clears `error` again — hold the reload's fetchInvites()
		// open so the message is observable before that happens.
		let resolveReload: (invites: (typeof invite)[]) => void = () => {};
		vi.mocked(fetchInvites)
			.mockResolvedValueOnce([invite])
			.mockImplementationOnce(() => new Promise((resolve) => (resolveReload = resolve)));
		vi.mocked(revokeInvite).mockRejectedValue(new ApiError(500, 'Could not revoke invite'));

		render(MembersPage);
		await expect.element(page.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Revoke' }).click();

		await expect.element(page.getByText('Could not revoke invite')).toBeInTheDocument();
		resolveReload!([invite]);
	});

	const sharedUser = {
		id: 9,
		fullName: 'Dana Scully',
		email: 'dana@example.com',
		createdAt: TS,
		updatedAt: null,
		initials: 'DS'
	};
	const sharedCandidate = {
		user: sharedUser,
		sharedListNames: ['Camping']
	};

	it('shows the direct-add section with known users to an owner', async () => {
		vi.mocked(fetchMemberCandidates).mockResolvedValue([
			sharedCandidate,
			{
				user: { ...sharedUser, id: 7, fullName: null, email: 'nameless@example.com' },
				sharedListNames: ['Groceries']
			}
		]);

		render(MembersPage);
		await expect.element(page.getByText('Dana Scully')).toBeInTheDocument();
		await expect.element(page.getByText('Shares Camping')).toBeInTheDocument();
		await expect.element(page.getByText('nameless@example.com')).toBeInTheDocument();
		await expect.element(page.getByText('Shares Groceries')).toBeInTheDocument();
	});

	it('shows an empty-state hint when there are no known users', async () => {
		render(MembersPage);
		await expect
			.element(page.getByText(/No one yet — people you already share another list/))
			.toBeInTheDocument();
	});

	it('lets an owner directly add a known user', async () => {
		const otherUser = {
			id: 8,
			fullName: 'Melinda May',
			email: 'melinda@example.com',
			createdAt: TS,
			updatedAt: null,
			initials: 'MM'
		};
		vi.mocked(fetchMemberCandidates).mockResolvedValue([
			sharedCandidate,
			{ user: otherUser, sharedListNames: ['Groceries'] }
		]);
		vi.mocked(addMember).mockResolvedValue({
			id: 13,
			listId: 5,
			userId: 8,
			role: 'viewer' as const,
			invitedAt: TS,
			acceptedAt: TS,
			user: otherUser
		});

		render(MembersPage);
		await expect.element(page.getByText('Melinda May')).toBeInTheDocument();

		await page.getByRole('combobox').nth(2).selectOptions('viewer');
		await page.getByRole('button', { name: 'Add' }).nth(1).click();

		expect(addMember).toHaveBeenCalledWith(5, 8, 'viewer');
		await expect.element(page.getByText('melinda@example.com').first()).toBeInTheDocument();
		await expect.element(page.getByText('Dana Scully')).toBeInTheDocument();
	});

	it('resets the candidate picker after the last known user is added', async () => {
		vi.mocked(fetchMemberCandidates).mockResolvedValue([sharedCandidate]);
		vi.mocked(addMember).mockResolvedValue({
			id: 13,
			listId: 5,
			userId: 9,
			role: 'editor' as const,
			invitedAt: TS,
			acceptedAt: TS,
			user: sharedUser
		});

		render(MembersPage);
		await expect.element(page.getByText('Dana Scully')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Add' }).click();

		expect(addMember).toHaveBeenCalledWith(5, 9, 'editor');
		await expect.element(page.getByText('dana@example.com').first()).toBeInTheDocument();
		await expect.element(page.getByText(/No one yet/)).toBeInTheDocument();
	});

	it('shows the ApiError message when adding a member fails', async () => {
		vi.mocked(fetchMemberCandidates).mockResolvedValue([sharedCandidate]);
		vi.mocked(addMember).mockRejectedValue(new ApiError(400, 'Already shares nothing'));

		render(MembersPage);
		await expect.element(page.getByText('Dana Scully')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Already shares nothing')).toBeInTheDocument();
	});

	it('shows a generic error message when adding a member fails without an ApiError', async () => {
		vi.mocked(fetchMemberCandidates).mockResolvedValue([sharedCandidate]);
		vi.mocked(addMember).mockRejectedValue(new TypeError('network down'));

		render(MembersPage);
		await expect.element(page.getByText('Dana Scully')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Failed to add member.')).toBeInTheDocument();
	});

	it('does not show the direct-add section to a non-owner', async () => {
		vi.mocked(fetchProfile).mockResolvedValue(editorUser);
		vi.mocked(fetchMemberCandidates).mockResolvedValue([sharedCandidate]);

		render(MembersPage);
		await expect.element(page.getByText('ed@example.com').first()).toBeInTheDocument();

		await expect.element(page.getByText(/Add someone you already share/)).not.toBeInTheDocument();
	});
});
