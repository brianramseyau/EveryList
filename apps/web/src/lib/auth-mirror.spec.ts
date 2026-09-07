import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
	Capacitor: { getPlatform: vi.fn(), registerPlugin: vi.fn() }
}));

const { Capacitor } = await import('@capacitor/core');
const getPlatform = vi.mocked(Capacitor.getPlatform);
const registerPlugin = vi.mocked(Capacitor.registerPlugin);
const { mirrorAuthToNative } = await import('./auth-mirror');

function mockNativeClient() {
	const client = { setToken: vi.fn().mockResolvedValue(undefined), clearToken: vi.fn().mockResolvedValue(undefined) };
	vi.mocked(registerPlugin).mockReturnValue(client as never);
	return client;
}

describe('mirrorAuthToNative', () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('is a no-op on iOS/web/Electron — only the Android native plugin exists', () => {
		getPlatform.mockReturnValue('ios');
		mirrorAuthToNative('token123', 'https://everylist.example.com');
		expect(registerPlugin).not.toHaveBeenCalled();
	});

	it('mirrors the token and server URL to the native plugin on Android', () => {
		getPlatform.mockReturnValue('android');
		const client = mockNativeClient();

		mirrorAuthToNative('token123', 'https://everylist.example.com');

		expect(registerPlugin).toHaveBeenCalledWith('AuthMirror');
		expect(client.setToken).toHaveBeenCalledWith({
			token: 'token123',
			serverUrl: 'https://everylist.example.com'
		});
		expect(client.clearToken).not.toHaveBeenCalled();
	});

	it('clears the native mirror when the token is null', () => {
		getPlatform.mockReturnValue('android');
		const client = mockNativeClient();

		mirrorAuthToNative(null, 'https://everylist.example.com');

		expect(client.clearToken).toHaveBeenCalled();
		expect(client.setToken).not.toHaveBeenCalled();
	});

	it('logs rather than throws when the native call rejects', async () => {
		getPlatform.mockReturnValue('android');
		const client = mockNativeClient();
		client.setToken.mockRejectedValue(new Error('boom'));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		mirrorAuthToNative('token123', 'https://everylist.example.com');
		await Promise.resolve();
		await Promise.resolve();

		expect(consoleError).toHaveBeenCalledWith(
			'Failed to mirror auth token to native storage',
			expect.any(Error)
		);
	});
});
