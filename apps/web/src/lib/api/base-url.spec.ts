import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./server-url', () => ({ getServerUrl: vi.fn() }));
vi.mock('./ingress', () => ({ ingressBase: vi.fn() }));

const { getServerUrl } = await import('./server-url');
const { ingressBase } = await import('./ingress');
const { apiBaseUrl } = await import('./base-url');

describe('apiBaseUrl', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('delegates to the persisted, user-configured server URL', () => {
		vi.mocked(ingressBase).mockReturnValue('');
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		expect(apiBaseUrl()).toBe('https://everylist.example.com');
	});

	it('is an empty string (same-origin) when no server URL is configured', () => {
		vi.mocked(ingressBase).mockReturnValue('');
		vi.mocked(getServerUrl).mockReturnValue('');
		expect(apiBaseUrl()).toBe('');
	});

	it('prefers the Home Assistant Ingress base path over the native server URL', () => {
		vi.mocked(ingressBase).mockReturnValue('/api/hassio_ingress/abc123');
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		expect(apiBaseUrl()).toBe('/api/hassio_ingress/abc123');
	});
});
