import { describe, expect, it } from 'vitest';
import { getCachedFolders } from './folders';

// Deliberately does NOT import 'fake-indexeddb/auto' — exercises the no-op
// fallback when Dexie isn't available (SSR/prerender), mirroring
// sync-queue-no-indexeddb.spec.ts / db-no-indexeddb.spec.ts.
describe('without an IndexedDB implementation', () => {
	it('getCachedFolders resolves undefined', async () => {
		await expect(getCachedFolders()).resolves.toBeUndefined();
	});
});
