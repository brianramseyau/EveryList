import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiBaseUrl } from './base-url';

describe('apiBaseUrl', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('defaults to an empty string (same-origin) when unset', () => {
		expect(apiBaseUrl()).toBe('');
	});

	it('returns the configured absolute URL when set, for the native build', () => {
		vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
		expect(apiBaseUrl()).toBe('https://api.example.com');
	});
});
