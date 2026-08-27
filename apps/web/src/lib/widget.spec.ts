import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: vi.fn(), registerPlugin: vi.fn() }
}));

// Partial-mock tokens so `createToken` is stubbed without dragging in the API
// client (whose other exports this spec never touches).
vi.mock('$lib/api/tokens', () => ({ createToken: vi.fn() }));
vi.mock('$lib/api/server-url', () => ({ getServerUrl: vi.fn() }));

const { Capacitor } = await import('@capacitor/core');
const isNativePlatform = vi.mocked(Capacitor.isNativePlatform);
const registerPlugin = vi.mocked(Capacitor.registerPlugin);
const { createToken } = await import('$lib/api/tokens');
const { getServerUrl } = await import('$lib/api/server-url');
const { configureWidget, WIDGET_TOKEN_NAME } = await import('./widget');

function mockNativeClient(configure: ReturnType<typeof vi.fn>) {
	const client = { configure };
	vi.mocked(registerPlugin).mockReturnValue(client as never);
	return client;
}

describe('widget', () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('is a no-op (returns false) on the web/PWA build', async () => {
		isNativePlatform.mockReturnValue(false);
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		expect(await configureWidget([1])).toBe(false);
		expect(registerPlugin).not.toHaveBeenCalled();
		expect(createToken).not.toHaveBeenCalled();
	});

	it('is a no-op when no server URL is configured', async () => {
		isNativePlatform.mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('');
		mockNativeClient(vi.fn().mockResolvedValue(undefined));
		expect(await configureWidget([1])).toBe(false);
		expect(createToken).not.toHaveBeenCalled();
	});

	it('mints a list-scoped widget PAT and hands it to the native plugin on native', async () => {
		isNativePlatform.mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		const configure = vi.fn().mockResolvedValue(undefined);
		mockNativeClient(configure);
		vi.mocked(createToken).mockResolvedValue({
			id: 42,
			name: WIDGET_TOKEN_NAME,
			grants: [{ listId: 3, role: 'editor' }],
			lastUsedAt: null,
			expiresAt: null,
			createdAt: new Date().toISOString(),
			token: 'elt_widget123'
		});

		const result = await configureWidget([3]);

		expect(result).toBe(true);
		expect(createToken).toHaveBeenCalledWith(WIDGET_TOKEN_NAME, [3], 'editor');
		expect(registerPlugin).toHaveBeenCalledWith('EveryListWidget');
		expect(configure).toHaveBeenCalledWith({
			token: 'elt_widget123',
			listIds: [3],
			serverUrl: 'https://everylist.example.com'
		});
	});
});
