import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	applyOrientation,
	canLockOrientation,
	getOrientationPreference,
	initOrientation,
	setOrientationPreference
} from './orientation';

// Runs in the "client" (real Chromium) project so `window.localStorage` and
// `screen.orientation` are the genuine browser implementations — see
// orientation.spec.ts for the SSR/no-window guard.
describe('orientation (browser)', () => {
	afterEach(() => {
		window.localStorage.removeItem('everylist:orientation');
		vi.restoreAllMocks();
	});

	it('defaults to automatic when nothing is stored', () => {
		expect(getOrientationPreference()).toBe('automatic');
	});

	it('ignores a corrupted stored value and falls back to automatic', () => {
		window.localStorage.setItem('everylist:orientation', 'sideways');
		expect(getOrientationPreference()).toBe('automatic');
	});

	it('canLockOrientation reflects the display-mode media query (false in a plain browser tab)', () => {
		expect(canLockOrientation()).toBe(false);
	});

	it('applyOrientation calls lock() with the requested orientation', async () => {
		const lockSpy = vi.spyOn(screen.orientation, 'lock').mockResolvedValue(undefined);

		await applyOrientation('portrait');

		expect(lockSpy).toHaveBeenCalledWith('portrait');
	});

	it('applyOrientation calls unlock() for "automatic"', async () => {
		const unlockSpy = vi.spyOn(screen.orientation, 'unlock').mockImplementation(() => {});

		await applyOrientation('automatic');

		expect(unlockSpy).toHaveBeenCalled();
	});

	it('applyOrientation swallows a lock() rejection (e.g. not running standalone)', async () => {
		vi.spyOn(screen.orientation, 'lock').mockRejectedValue(new Error('NotSupportedError'));

		await expect(applyOrientation('landscape')).resolves.toBeUndefined();
	});

	it('setOrientationPreference persists the choice and applies it', async () => {
		const lockSpy = vi.spyOn(screen.orientation, 'lock').mockResolvedValue(undefined);

		await setOrientationPreference('portrait');

		expect(window.localStorage.getItem('everylist:orientation')).toBe('portrait');
		expect(getOrientationPreference()).toBe('portrait');
		expect(lockSpy).toHaveBeenCalledWith('portrait');
	});

	it('initOrientation applies whatever preference is already stored', async () => {
		const lockSpy = vi.spyOn(screen.orientation, 'lock').mockResolvedValue(undefined);
		window.localStorage.setItem('everylist:orientation', 'landscape');

		await initOrientation();

		expect(lockSpy).toHaveBeenCalledWith('landscape');
	});
});
