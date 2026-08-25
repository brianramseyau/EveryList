import { describe, expect, it } from 'vitest';
import { getFavoriteIcons, recordIconUse } from './favorites';

// Runs in the "server" (node) project, which has no `window` — exercises
// the SSR/prerendering guard. See favorites.svelte.spec.ts for the real
// browser/localStorage behavior.
describe('favorites (no window)', () => {
	it('getFavoriteIcons returns an empty array and recordIconUse is a no-op', () => {
		expect(getFavoriteIcons()).toEqual([]);
		expect(() => recordIconUse('cup')).not.toThrow();
	});
});
