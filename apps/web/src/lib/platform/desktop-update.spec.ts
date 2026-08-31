import { describe, expect, it } from 'vitest';
import { checkForDesktopUpdate } from './desktop-update';

// This runs in the "server" (node) project, which has no `window` — see
// desktop-update.svelte.spec.ts for the real-bridge behavior.
describe('checkForDesktopUpdate (no window)', () => {
	it('reports unavailable without throwing', async () => {
		expect(await checkForDesktopUpdate()).toEqual({ status: 'unavailable' });
	});
});
