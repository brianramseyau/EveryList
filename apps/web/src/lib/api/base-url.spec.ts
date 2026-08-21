import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./server-url', () => ({ getServerUrl: vi.fn() }));

const { getServerUrl } = await import('./server-url');
const { apiBaseUrl } = await import('./base-url');

describe('apiBaseUrl', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('delegates to the persisted, user-configured server URL', () => {
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		expect(apiBaseUrl()).toBe('https://everylist.example.com');
	});

	it('is an empty string (same-origin) when no server URL is configured', () => {
		vi.mocked(getServerUrl).mockReturnValue('');
		expect(apiBaseUrl()).toBe('');
	});
});
