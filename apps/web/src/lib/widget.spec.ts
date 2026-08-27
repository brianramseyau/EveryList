import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }));
vi.mock('@capacitor/app-launcher', () => ({ AppLauncher: { openUrl: vi.fn() } }));

// Partial-mock tokens so `createToken` is stubbed without dragging in the API
// client (whose other exports this spec never touches).
vi.mock('$lib/api/tokens', () => ({ createToken: vi.fn() }));
vi.mock('$lib/api/server-url', () => ({ getServerUrl: vi.fn() }));

const { Capacitor } = await import('@capacitor/core');
const isNativePlatform = vi.mocked(Capacitor.isNativePlatform);
const { AppLauncher } = await import('@capacitor/app-launcher');
const openUrl = vi.mocked(AppLauncher.openUrl);
const { createToken } = await import('$lib/api/tokens');
const { getServerUrl } = await import('$lib/api/server-url');
const { buildWidgetConfigUrl, configureWidget, WIDGET_TOKEN_NAME } = await import('./widget');

describe('widget', () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('builds the everylist://widget-config deep link with encoded params', () => {
		const url = buildWidgetConfigUrl({
			token: 'elt_abc123',
			listIds: [1, 7],
			serverUrl: 'https://everylist.example.com'
		});
		expect(url).toBe(
			'everylist://widget-config?token=elt_abc123&serverUrl=https%3A%2F%2Feverylist.example.com&listIds=1%2C7'
		);
	});

	it('is a no-op (returns false) on the web/PWA build', async () => {
		isNativePlatform.mockReturnValue(false);
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		expect(await configureWidget([1])).toBe(false);
		expect(createToken).not.toHaveBeenCalled();
		expect(openUrl).not.toHaveBeenCalled();
	});

	it('is a no-op when no server URL is configured', async () => {
		isNativePlatform.mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('');
		expect(await configureWidget([1])).toBe(false);
		expect(createToken).not.toHaveBeenCalled();
		expect(openUrl).not.toHaveBeenCalled();
	});

	it('mints a list-scoped widget PAT and opens the deep link on native', async () => {
		isNativePlatform.mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		vi.mocked(createToken).mockResolvedValue({
			id: 42,
			name: WIDGET_TOKEN_NAME,
			grants: [{ listId: 3, role: 'editor' }],
			lastUsedAt: null,
			expiresAt: null,
			createdAt: new Date().toISOString(),
			token: 'elt_widget123'
		});
		openUrl.mockResolvedValue({ completed: true });

		const result = await configureWidget([3]);

		expect(result).toBe(true);
		expect(createToken).toHaveBeenCalledWith(WIDGET_TOKEN_NAME, [3], 'editor');
		expect(openUrl).toHaveBeenCalledWith({
			url: 'everylist://widget-config?token=elt_widget123&serverUrl=https%3A%2F%2Feverylist.example.com&listIds=3'
		});
	});

	it('reports a failed deep-link launch as false', async () => {
		isNativePlatform.mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		vi.mocked(createToken).mockResolvedValue({
			id: 1,
			name: WIDGET_TOKEN_NAME,
			grants: [],
			lastUsedAt: null,
			expiresAt: null,
			createdAt: new Date().toISOString(),
			token: 'elt_abc'
		});
		openUrl.mockResolvedValue({ completed: false });

		expect(await configureWidget([1])).toBe(false);
	});
});
