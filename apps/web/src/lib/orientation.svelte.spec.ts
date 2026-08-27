import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }));
vi.mock('@capacitor/screen-orientation', () => ({
	ScreenOrientation: { lock: vi.fn(), unlock: vi.fn() }
}));

const { Capacitor } = await import('@capacitor/core');
const isNativePlatform = Capacitor.isNativePlatform;
const { ScreenOrientation } = await import('@capacitor/screen-orientation');
const {
	applyOrientation,
	canLockOrientation,
	getOrientationPreference,
	initOrientation,
	setOrientationPreference,
	supportsScreenOrientationLock
} = await import('./orientation');

// Runs in the "client" (real Chromium) project so `window.localStorage` and
// `screen.orientation` are the genuine browser implementations — see
// orientation.spec.ts for the SSR/no-window guard.
describe('orientation (browser)', () => {
	afterEach(() => {
		window.localStorage.removeItem('everylist:orientation');
		vi.clearAllMocks();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.mocked(isNativePlatform).mockReturnValue(false);
	});

	it('defaults to automatic when nothing is stored', () => {
		expect(getOrientationPreference()).toBe('automatic');
	});

	it('ignores a corrupted stored value and falls back to automatic', () => {
		window.localStorage.setItem('everylist:orientation', 'sideways');
		expect(getOrientationPreference()).toBe('automatic');
	});

	it('supportsScreenOrientationLock is true in a browser with the lock API', () => {
		expect(supportsScreenOrientationLock()).toBe(true);
	});

	it('supportsScreenOrientationLock is false when the lock API is absent (e.g. Safari)', () => {
		vi.stubGlobal('screen', { orientation: { type: 'landscape-primary', angle: 0 } });

		expect(supportsScreenOrientationLock()).toBe(false);
	});

	it('canLockOrientation reflects the display-mode media query (false in a plain browser tab)', () => {
		expect(canLockOrientation()).toBe(false);
	});

	it('canLockOrientation is true when running standalone', () => {
		const matchMediaSpy = vi
			.spyOn(window, 'matchMedia')
			.mockReturnValue({ matches: true } as MediaQueryList);

		expect(canLockOrientation()).toBe(true);

		matchMediaSpy.mockRestore();
	});

	it('applyOrientation calls lock() with the requested orientation when standalone', async () => {
		const lockSpy = vi.spyOn(screen.orientation, 'lock').mockResolvedValue(undefined);
		vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);

		const result = await applyOrientation('portrait');

		expect(lockSpy).toHaveBeenCalledWith('portrait');
		expect(result).toEqual({ status: 'locked', orientation: 'portrait' });
	});

	it('applyOrientation calls unlock() for "automatic"', async () => {
		const unlockSpy = vi.spyOn(screen.orientation, 'unlock').mockImplementation(() => {});

		const result = await applyOrientation('automatic');

		expect(unlockSpy).toHaveBeenCalled();
		expect(result).toEqual({ status: 'unlocked' });
	});

	it('applyOrientation reports a lock() rejection (e.g. system Auto-rotate off on Android)', async () => {
		vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
		vi.spyOn(screen.orientation, 'lock').mockRejectedValue(new Error('NotSupportedError'));

		const result = await applyOrientation('landscape');

		expect(result).toEqual({ status: 'failed', reason: 'rejected' });
	});

	it('applyOrientation reports not-standalone in a plain browser tab without calling lock()', async () => {
		const lockSpy = vi.spyOn(screen.orientation, 'lock').mockResolvedValue(undefined);

		const result = await applyOrientation('portrait');

		expect(result).toEqual({ status: 'failed', reason: 'not-standalone' });
		expect(lockSpy).not.toHaveBeenCalled();
	});

	it('applyOrientation reports no-api when the lock method is absent (e.g. Safari)', async () => {
		vi.stubGlobal('screen', { orientation: { type: 'portrait-primary', angle: 0 } });

		const result = await applyOrientation('portrait');

		expect(result).toEqual({ status: 'failed', reason: 'no-api' });
	});

	it('setOrientationPreference persists the choice and applies it', async () => {
		const lockSpy = vi.spyOn(screen.orientation, 'lock').mockResolvedValue(undefined);
		vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);

		const result = await setOrientationPreference('portrait');

		expect(window.localStorage.getItem('everylist:orientation')).toBe('portrait');
		expect(getOrientationPreference()).toBe('portrait');
		expect(lockSpy).toHaveBeenCalledWith('portrait');
		expect(result).toEqual({ status: 'locked', orientation: 'portrait' });
	});

	it('initOrientation applies whatever preference is already stored', async () => {
		const lockSpy = vi.spyOn(screen.orientation, 'lock').mockResolvedValue(undefined);
		vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
		window.localStorage.setItem('everylist:orientation', 'landscape');

		await initOrientation();

		expect(lockSpy).toHaveBeenCalledWith('landscape');
	});
});

describe('orientation (native)', () => {
	afterEach(() => {
		window.localStorage.removeItem('everylist:orientation');
		vi.clearAllMocks();
		vi.restoreAllMocks();
		vi.mocked(isNativePlatform).mockReturnValue(false);
	});

	it('canLockOrientation is always true on native', () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);

		expect(canLockOrientation()).toBe(true);
	});

	it('applyOrientation locks via the native plugin', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		vi.mocked(ScreenOrientation.lock).mockResolvedValue(undefined);

		const result = await applyOrientation('portrait');

		expect(ScreenOrientation.lock).toHaveBeenCalledWith({ orientation: 'portrait' });
		expect(result).toEqual({ status: 'locked', orientation: 'portrait' });
	});

	it('applyOrientation unlocks via the native plugin for "automatic"', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		vi.mocked(ScreenOrientation.unlock).mockResolvedValue(undefined);

		const result = await applyOrientation('automatic');

		expect(ScreenOrientation.unlock).toHaveBeenCalled();
		expect(result).toEqual({ status: 'unlocked' });
	});

	it('applyOrientation reports a native lock() rejection', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		vi.mocked(ScreenOrientation.lock).mockRejectedValue(new Error('not available'));

		const result = await applyOrientation('landscape');

		expect(result).toEqual({ status: 'failed', reason: 'rejected' });
	});

	it('setOrientationPreference persists and locks via the native plugin', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		vi.mocked(ScreenOrientation.lock).mockResolvedValue(undefined);

		const result = await setOrientationPreference('landscape');

		expect(window.localStorage.getItem('everylist:orientation')).toBe('landscape');
		expect(ScreenOrientation.lock).toHaveBeenCalledWith({ orientation: 'landscape' });
		expect(result).toEqual({ status: 'locked', orientation: 'landscape' });
	});

	it('initOrientation applies the stored preference via the native plugin', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		vi.mocked(ScreenOrientation.lock).mockResolvedValue(undefined);
		window.localStorage.setItem('everylist:orientation', 'portrait');

		await initOrientation();

		expect(ScreenOrientation.lock).toHaveBeenCalledWith({ orientation: 'portrait' });
	});
});
