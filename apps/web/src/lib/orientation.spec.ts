import { describe, expect, it } from 'vitest';
import {
	applyOrientation,
	canLockOrientation,
	getOrientationPreference,
	initOrientation,
	setOrientationPreference,
	supportsScreenOrientationLock
} from './orientation';

// Runs in the "server" (node) project, which has no `window` — exercises the
// SSR/prerendering guard on every export. See orientation.svelte.spec.ts for
// the real browser behavior.
describe('orientation (no window)', () => {
	it('getOrientationPreference defaults to automatic', () => {
		expect(getOrientationPreference()).toBe('automatic');
	});

	it('canLockOrientation is false', () => {
		expect(canLockOrientation()).toBe(false);
	});

	it('supportsScreenOrientationLock is false', () => {
		expect(supportsScreenOrientationLock()).toBe(false);
	});

	it('applyOrientation, setOrientationPreference, and initOrientation are no-ops without throwing', async () => {
		await expect(applyOrientation('portrait')).resolves.toBeUndefined();
		await expect(setOrientationPreference('landscape')).resolves.toBeUndefined();
		await expect(initOrientation()).resolves.toBeUndefined();
	});
});
