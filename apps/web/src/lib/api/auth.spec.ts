import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({ apiPost: vi.fn() }));
vi.mock('./token', () => ({ setToken: vi.fn(), clearToken: vi.fn() }));

const { apiPost } = await import('./client');
const { setToken, clearToken } = await import('./token');
const { login, logout, signup } = await import('./auth');

const authResponse = {
	user: {
		id: 1,
		fullName: 'Ada Lovelace',
		email: 'ada@example.com',
		createdAt: '2026-08-01T00:00:00.000Z',
		updatedAt: null,
		initials: 'AL'
	},
	token: 'tok-123'
};

describe('auth', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('signup posts the payload and stores the returned token', async () => {
		vi.mocked(apiPost).mockResolvedValue(authResponse);

		const input = {
			fullName: 'Ada Lovelace',
			email: 'ada@example.com',
			password: 'password123',
			passwordConfirmation: 'password123'
		};
		await expect(signup(input)).resolves.toEqual(authResponse);

		expect(apiPost).toHaveBeenCalledWith('/api/v1/auth/signup', input);
		expect(setToken).toHaveBeenCalledWith('tok-123');
	});

	it('login posts the payload and stores the returned token', async () => {
		vi.mocked(apiPost).mockResolvedValue(authResponse);

		const input = { email: 'ada@example.com', password: 'password123' };
		await expect(login(input)).resolves.toEqual(authResponse);

		expect(apiPost).toHaveBeenCalledWith('/api/v1/auth/login', input);
		expect(setToken).toHaveBeenCalledWith('tok-123');
	});

	it('logout clears the token even if the request fails', async () => {
		vi.mocked(apiPost).mockRejectedValue(new Error('network error'));

		await expect(logout()).rejects.toThrow('network error');

		expect(apiPost).toHaveBeenCalledWith('/api/v1/account/logout');
		expect(clearToken).toHaveBeenCalled();
	});

	it('logout clears the token on success too', async () => {
		vi.mocked(apiPost).mockResolvedValue(undefined);

		await logout();

		expect(clearToken).toHaveBeenCalled();
	});
});
