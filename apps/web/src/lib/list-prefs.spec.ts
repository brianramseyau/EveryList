import { describe, expect, it } from 'vitest';
import { getShowChecked, setShowChecked } from './list-prefs';

// Runs in the "server" (node) project, which has no `window` — exercises
// the SSR guard on the localStorage-backed preference.
describe('list-prefs (no window)', () => {
	it('getShowChecked defaults to true and setShowChecked is a no-op', () => {
		expect(getShowChecked(1)).toBe(true);
		expect(() => setShowChecked(1, false)).not.toThrow();
	});
});
