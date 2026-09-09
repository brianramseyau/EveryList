import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminUser, deleteAdminUser, fetchAdminUsers, updateAdminUser } from './admin-users';

const user = {
	id: 2,
	fullName: 'New Guy',
	email: 'new-guy@example.com',
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null,
	disabledAt: null
};

describe('admin-users API client', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fetchAdminUsers returns the parsed user list', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [user] }) })
		);

		await expect(fetchAdminUsers()).resolves.toEqual([user]);
	});

	it('createAdminUser posts the new-user body and returns the created user', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: user }) });
		vi.stubGlobal('fetch', fetchMock);

		const result = await createAdminUser({
			fullName: 'New Guy',
			email: 'new-guy@example.com',
			password: 'password123'
		});

		expect(result).toEqual(user);
		const [, init] = fetchMock.mock.calls[0];
		expect(init.method).toBe('POST');
	});

	it('updateAdminUser patches the target user and returns the updated user', async () => {
		const updated = { ...user, fullName: 'Renamed' };
		const fetchMock = vi
			.fn()
			.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: updated }) });
		vi.stubGlobal('fetch', fetchMock);

		const result = await updateAdminUser(2, { fullName: 'Renamed' });

		expect(result).toEqual(updated);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain('/api/v1/admin/users/2');
		expect(init.method).toBe('PATCH');
	});

	it('deleteAdminUser sends a DELETE request', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
		vi.stubGlobal('fetch', fetchMock);

		await deleteAdminUser(2);

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain('/api/v1/admin/users/2');
		expect(init.method).toBe('DELETE');
	});
});
