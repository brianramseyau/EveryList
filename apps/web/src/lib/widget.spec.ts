import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: vi.fn(), registerPlugin: vi.fn() }
}));

// Partial-mock tokens so `createToken` is stubbed without dragging in the API
// client (whose other exports this spec never touches).
vi.mock('$lib/api/tokens', () => ({
	createToken: vi.fn(),
	fetchTokens: vi.fn(),
	updateToken: vi.fn(),
	revokeToken: vi.fn()
}));
vi.mock('$lib/api/server-url', () => ({ getServerUrl: vi.fn() }));

const { Capacitor } = await import('@capacitor/core');
const isNativePlatform = vi.mocked(Capacitor.isNativePlatform);
const registerPlugin = vi.mocked(Capacitor.registerPlugin);
const { createToken, fetchTokens, updateToken, revokeToken } = await import('$lib/api/tokens');
const { getServerUrl } = await import('$lib/api/server-url');
const { configureWidget, currentWidgetListIds } = await import('./widget');
const { widgetTokenName } = await import('./widget-token');

const NAME = widgetTokenName('abc123');
const existingToken = {
	id: 42,
	name: NAME,
	grants: [{ listId: 3, role: 'editor' as const }],
	lastUsedAt: null,
	expiresAt: null,
	createdAt: new Date().toISOString()
};

function mockNativeClient(configure: ReturnType<typeof vi.fn>, tokenId: number | null = null) {
	const client = {
		configure,
		status: vi.fn().mockResolvedValue({
			deviceId: 'abc123',
			tokenId,
			serverUrl: 'https://everylist.example.com'
		})
	};
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

	it('mints one device-named widget PAT the first time', async () => {
		isNativePlatform.mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		const configure = vi.fn().mockResolvedValue(undefined);
		mockNativeClient(configure);
		vi.mocked(fetchTokens).mockResolvedValue([]);
		vi.mocked(createToken).mockResolvedValue({ ...existingToken, token: 'elt_widget123' });

		expect(await configureWidget([3])).toBe(true);
		expect(createToken).toHaveBeenCalledWith(NAME, [3], 'editor');
		expect(registerPlugin).toHaveBeenCalledWith('EveryListWidget');
		expect(configure).toHaveBeenCalledWith({
			token: 'elt_widget123',
			tokenId: 42,
			listIds: [3],
			serverUrl: 'https://everylist.example.com'
		});
	});

	it('updates the existing PAT in place instead of minting another', async () => {
		isNativePlatform.mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		const configure = vi.fn().mockResolvedValue(undefined);
		mockNativeClient(configure, 42);
		vi.mocked(fetchTokens).mockResolvedValue([existingToken]);

		expect(await configureWidget([3, 4])).toBe(true);
		expect(createToken).not.toHaveBeenCalled();
		expect(updateToken).toHaveBeenCalledWith(42, [3, 4], 'editor', NAME);
		expect(configure).toHaveBeenCalledWith({
			listIds: [3, 4],
			serverUrl: 'https://everylist.example.com'
		});
	});

	it('replaces the token when the widget holds a different account’s PAT', async () => {
		isNativePlatform.mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		const configure = vi.fn().mockResolvedValue(undefined);
		mockNativeClient(configure, 99);
		vi.mocked(fetchTokens).mockResolvedValue([existingToken]);
		vi.mocked(createToken).mockResolvedValue({ ...existingToken, id: 77, token: 'elt_new' });

		await configureWidget([3]);
		expect(updateToken).not.toHaveBeenCalled();
		expect(revokeToken).toHaveBeenCalledWith(42);
		expect(configure).toHaveBeenCalledWith({
			token: 'elt_new',
			tokenId: 77,
			listIds: [3],
			serverUrl: 'https://everylist.example.com'
		});
	});

	it('does not trust a held token id issued by a different server', async () => {
		isNativePlatform.mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('https://other.example.com');
		const configure = vi.fn().mockResolvedValue(undefined);
		mockNativeClient(configure, 42);
		vi.mocked(fetchTokens).mockResolvedValue([existingToken]);
		vi.mocked(createToken).mockResolvedValue({ ...existingToken, id: 77, token: 'elt_new' });

		await configureWidget([3]);
		expect(updateToken).not.toHaveBeenCalled();
		expect(revokeToken).toHaveBeenCalledWith(42);
		expect(configure).toHaveBeenCalledWith({
			token: 'elt_new',
			tokenId: 77,
			listIds: [3],
			serverUrl: 'https://other.example.com'
		});
	});

	it('replaces a server token whose plaintext this device lost', async () => {
		isNativePlatform.mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		const configure = vi.fn().mockResolvedValue(undefined);
		mockNativeClient(configure, null);
		vi.mocked(fetchTokens).mockResolvedValue([existingToken]);
		vi.mocked(createToken).mockResolvedValue({ ...existingToken, id: 77, token: 'elt_new' });

		await configureWidget([3]);
		expect(revokeToken).toHaveBeenCalledWith(42);
		expect(createToken).toHaveBeenCalledWith(NAME, [3], 'editor');
	});

	describe('currentWidgetListIds', () => {
		beforeEach(() => {
			vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		});

		it('is empty on the web build', async () => {
			isNativePlatform.mockReturnValue(false);
			expect(await currentWidgetListIds()).toEqual([]);
		});

		it('is empty before the widget is set up', async () => {
			isNativePlatform.mockReturnValue(true);
			mockNativeClient(vi.fn(), null);
			expect(await currentWidgetListIds()).toEqual([]);
		});

		it('returns the existing token grants', async () => {
			isNativePlatform.mockReturnValue(true);
			mockNativeClient(vi.fn(), 42);
			vi.mocked(fetchTokens).mockResolvedValue([existingToken]);
			expect(await currentWidgetListIds()).toEqual([3]);
		});

		it('is empty when the widget holds another account’s token', async () => {
			isNativePlatform.mockReturnValue(true);
			mockNativeClient(vi.fn(), 99);
			vi.mocked(fetchTokens).mockResolvedValue([existingToken]);
			expect(await currentWidgetListIds()).toEqual([]);
		});

		it('is empty when the held token came from a different server', async () => {
			isNativePlatform.mockReturnValue(true);
			vi.mocked(getServerUrl).mockReturnValue('https://other.example.com');
			mockNativeClient(vi.fn(), 42);
			expect(await currentWidgetListIds()).toEqual([]);
		});

		it('is empty when the token lookup fails (offline)', async () => {
			isNativePlatform.mockReturnValue(true);
			mockNativeClient(vi.fn(), 42);
			vi.mocked(fetchTokens).mockRejectedValue(new Error('offline'));
			expect(await currentWidgetListIds()).toEqual([]);
		});

		it('is empty when the server has no matching token', async () => {
			isNativePlatform.mockReturnValue(true);
			mockNativeClient(vi.fn(), 42);
			vi.mocked(fetchTokens).mockResolvedValue([]);
			expect(await currentWidgetListIds()).toEqual([]);
		});
	});
});
