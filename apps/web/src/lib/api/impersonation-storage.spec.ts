import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, readStoredImpersonation } from './impersonation-storage';

const stored = { adminToken: 'a', impersonationToken: 'i', label: 'Grace' };

describe('readStoredImpersonation', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns null outside a browser (prerender)', () => {
		vi.stubGlobal('window', undefined);

		expect(readStoredImpersonation()).toBeNull();
	});

	it('returns null when nothing is stored', () => {
		vi.stubGlobal('window', { localStorage: { getItem: () => null } });

		expect(readStoredImpersonation()).toBeNull();
	});

	it('parses a stored impersonation', () => {
		vi.stubGlobal('window', {
			localStorage: {
				getItem: (key: string) => (key === STORAGE_KEY ? JSON.stringify(stored) : null)
			}
		});

		expect(readStoredImpersonation()).toEqual(stored);
	});

	it('returns null for corrupt stored state', () => {
		vi.stubGlobal('window', { localStorage: { getItem: () => '{not json' } });

		expect(readStoredImpersonation()).toBeNull();
	});
});
