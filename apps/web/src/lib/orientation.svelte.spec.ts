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

		await applyOrientation('portrait');

		expect(ScreenOrientation.lock).toHaveBeenCalledWith({ orientation: 'portrait' });
	});

	it('applyOrientation unlocks via the native plugin for "automatic"', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		vi.mocked(ScreenOrientation.unlock).mockResolvedValue(undefined);

		await applyOrientation('automatic');

		expect(ScreenOrientation.unlock).toHaveBeenCalled();
	});

	it('applyOrientation swallows a native lock() rejection', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		vi.mocked(ScreenOrientation.lock).mockRejectedValue(new Error('not available'));

		await expect(applyOrientation('landscape')).resolves.toBeUndefined();
	});

	it('setOrientationPreference persists and locks via the native plugin', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		vi.mocked(ScreenOrientation.lock).mockResolvedValue(undefined);

		await setOrientationPreference('landscape');

		expect(window.localStorage.getItem('everylist:orientation')).toBe('landscape');
		expect(ScreenOrientation.lock).toHaveBeenCalledWith({ orientation: 'landscape' });
	});

	it('initOrientation applies the stored preference via the native plugin', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		vi.mocked(ScreenOrientation.lock).mockResolvedValue(undefined);
		window.localStorage.setItem('everylist:orientation', 'portrait');

		await initOrientation();

		expect(ScreenOrientation.lock).toHaveBeenCalledWith({ orientation: 'portrait' });
	});
});
