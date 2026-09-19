import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getToken, setToken, clearToken } from './token';
import { PendingChangesError } from './impersonation-errors';

vi.mock('./client', () => ({ apiPost: vi.fn() }));
vi.mock('./admin-users', () => ({ impersonateAdminUser: vi.fn() }));
vi.mock('../offline/db', () => ({ clearLocalData: vi.fn() }));
vi.mock('../offline/sync-queue', () => ({ queueCounts: vi.fn() }));

const { apiPost } = await import('./client');
const { impersonateAdminUser } = await import('./admin-users');
const { clearLocalData } = await import('../offline/db');
const { queueCounts } = await import('../offline/sync-queue');
const { impersonatedLabel, reconcileImpersonation, startImpersonation, stopImpersonation } =
	await import('./impersonation.svelte');

const target = { id: 2, label: 'Grace Hopper' };

describe('impersonation', () => {
	beforeEach(() => {
		vi.mocked(queueCounts).mockResolvedValue({ pending: 0, failed: 0, conflict: 0 });
		setToken('admin-token');
		vi.mocked(impersonateAdminUser).mockResolvedValue({
			user: {} as never,
			token: 'imp-token'
		});
	});

	afterEach(async () => {
		// Leave the module's own state clean for the next test.
		vi.mocked(apiPost).mockResolvedValue(undefined);
		await stopImpersonation();
		vi.clearAllMocks();
		clearToken();
		window.localStorage.removeItem('everylist:impersonation');
	});

	it('is not impersonating by default', () => {
		expect(impersonatedLabel()).toBeNull();
	});

	it('swaps in the minted token, wipes the local cache, and reports the target', async () => {
		await startImpersonation(target);

		expect(getToken()).toBe('imp-token');
		expect(impersonatedLabel()).toBe('Grace Hopper');
		expect(clearLocalData).toHaveBeenCalledTimes(1);
	});

	it('refuses to start without an admin session to come back to', async () => {
		clearToken();

		await expect(startImpersonation(target)).rejects.toThrow('Not signed in');
		expect(impersonatedLabel()).toBeNull();
	});

	it('restores the admin token on exit and revokes the impersonation token', async () => {
		vi.mocked(apiPost).mockResolvedValue(undefined);
		await startImpersonation(target);

		await stopImpersonation();

		expect(apiPost).toHaveBeenCalledWith('/api/v1/account/logout');
		expect(getToken()).toBe('admin-token');
		expect(impersonatedLabel()).toBeNull();
		expect(window.localStorage.getItem('everylist:impersonation')).toBeNull();
		expect(clearLocalData).toHaveBeenCalledTimes(2);
	});

	it('still restores the admin session when revoking fails', async () => {
		await startImpersonation(target);
		vi.mocked(apiPost).mockRejectedValue(new Error('offline'));

		await stopImpersonation();

		expect(getToken()).toBe('admin-token');
		expect(impersonatedLabel()).toBeNull();
	});

	it('does nothing when stopping without an active impersonation', async () => {
		await stopImpersonation();

		expect(apiPost).not.toHaveBeenCalled();
		expect(getToken()).toBe('admin-token');
	});

	it('does not treat a stale entry as active once the live token differs', async () => {
		await startImpersonation(target);
		setToken('someone-elses-token');

		expect(impersonatedLabel()).toBeNull();
	});

	it.each([
		['pending', { pending: 1, failed: 0, conflict: 0 }],
		['failed', { pending: 0, failed: 1, conflict: 0 }],
		['conflicted', { pending: 0, failed: 0, conflict: 1 }]
	])('refuses to start while %s changes are queued', async (_label, counts) => {
		vi.mocked(queueCounts).mockResolvedValue(counts);

		await expect(startImpersonation(target)).rejects.toBeInstanceOf(PendingChangesError);
		expect(clearLocalData).not.toHaveBeenCalled();
		expect(getToken()).toBe('admin-token');
	});

	it('drops the stored admin token once the impersonation token is no longer live', async () => {
		await startImpersonation(target);
		clearToken(); // e.g. a 401 on the expired 1-hour token

		reconcileImpersonation();

		expect(window.localStorage.getItem('everylist:impersonation')).toBeNull();
	});

	it('keeps the stored record while the impersonation token is still live', async () => {
		await startImpersonation(target);

		reconcileImpersonation();

		expect(window.localStorage.getItem('everylist:impersonation')).not.toBeNull();
	});

	it('does nothing when there is nothing to reconcile', () => {
		expect(() => reconcileImpersonation()).not.toThrow();
	});
});
