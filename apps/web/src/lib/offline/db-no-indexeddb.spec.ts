import { describe, expect, it } from 'vitest';
import { getDb, hasIndexedDb } from './db';

// Deliberately does NOT import 'fake-indexeddb/auto' — this file exercises
// the SSR/prerender guard path (no `indexedDB` global at all), mirroring
// the `hasStorage()`-false branch covered by token.spec.ts/selected-store.spec.ts
// for localStorage.
describe('without an IndexedDB implementation', () => {
	it('hasIndexedDb reports false', () => {
		expect(hasIndexedDb()).toBe(false);
	});

	it('getDb returns null instead of constructing a database', () => {
		expect(getDb()).toBeNull();
	});
});
