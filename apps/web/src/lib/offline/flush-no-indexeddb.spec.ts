import { describe, expect, it } from 'vitest';
import { flushQueue } from './flush';

// Deliberately does NOT import 'fake-indexeddb/auto' — exercises flushQueue's no-op fallback
// when Dexie isn't available (SSR/prerender), mirroring db-no-indexeddb.spec.ts.
describe('flushQueue without an IndexedDB implementation', () => {
	it('resolves without throwing', async () => {
		await expect(flushQueue()).resolves.toBeUndefined();
	});
});
