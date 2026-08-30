import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccelListener } from '@capacitor/motion';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }));
vi.mock('@capacitor/motion', () => ({ Motion: { addListener: vi.fn() } }));

const { Capacitor } = await import('@capacitor/core');
const isNativePlatform = Capacitor.isNativePlatform;
const { Motion } = await import('@capacitor/motion');
const {
	getShakeToUndoPreference,
	initShakeToUndo,
	needsShakePermissionPrompt,
	requestShakePermission,
	setShakeToUndoPreference,
	shakeNeedsRepromptThisSession,
	startShakeListening,
	stopShakeListening
} = await import('./shake');

// Runs in the "client" (real Chromium) project so `window.localStorage` and `devicemotion` are the
// genuine browser implementations — see shake.spec.ts for the SSR/no-window guard and the pure
// detector logic.
describe('shake (browser)', () => {
	afterEach(() => {
		stopShakeListening();
		window.localStorage.removeItem('everylist:shakeToUndo');
		delete (window.DeviceMotionEvent as unknown as { requestPermission?: unknown })
			.requestPermission;
		vi.clearAllMocks();
		vi.mocked(isNativePlatform).mockReturnValue(false);
	});

	function shakeEvent(
		gravity: { x: number | null; y: number | null; z: number | null } | null
	): DeviceMotionEvent {
		return new DeviceMotionEvent('devicemotion', {
			accelerationIncludingGravity: gravity ?? undefined
		});
	}

	it('defaults to enabled when nothing is stored', () => {
		expect(getShakeToUndoPreference()).toBe(true);
	});

	it('setShakeToUndoPreference persists off, and getShakeToUndoPreference reflects it', () => {
		setShakeToUndoPreference(false);

		expect(window.localStorage.getItem('everylist:shakeToUndo')).toBe('off');
		expect(getShakeToUndoPreference()).toBe(false);
	});

	it('setShakeToUndoPreference persists on', () => {
		setShakeToUndoPreference(false);
		setShakeToUndoPreference(true);

		expect(window.localStorage.getItem('everylist:shakeToUndo')).toBe('on');
		expect(getShakeToUndoPreference()).toBe(true);
	});

	it('needsShakePermissionPrompt is false on native — Android/iOS never gate motion behind a runtime prompt', () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);

		expect(needsShakePermissionPrompt()).toBe(false);
	});

	it('needsShakePermissionPrompt is false in a browser without the iOS-only requestPermission API', () => {
		expect(needsShakePermissionPrompt()).toBe(false);
	});

	it('needsShakePermissionPrompt is true when the iOS Safari requestPermission API is present', () => {
		(window.DeviceMotionEvent as unknown as { requestPermission: () => void }).requestPermission =
			vi.fn();

		expect(needsShakePermissionPrompt()).toBe(true);
	});

	it('requestShakePermission resolves true immediately when no prompt is needed', async () => {
		await expect(requestShakePermission()).resolves.toBe(true);
	});

	it('requestShakePermission resolves true when the user grants access', async () => {
		(
			window.DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
		).requestPermission = vi.fn().mockResolvedValue('granted');

		await expect(requestShakePermission()).resolves.toBe(true);
	});

	it('requestShakePermission resolves false when the user denies access', async () => {
		(
			window.DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
		).requestPermission = vi.fn().mockResolvedValue('denied');

		await expect(requestShakePermission()).resolves.toBe(false);
	});

	it('requestShakePermission resolves false when the prompt itself throws', async () => {
		(
			window.DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
		).requestPermission = vi.fn().mockRejectedValue(new Error('no'));

		await expect(requestShakePermission()).resolves.toBe(false);
	});

	it('startShakeListening on native adds a Motion accel listener and fires onShake for a strong reading', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		let listener: AccelListener | undefined;
		const handle = { remove: vi.fn().mockResolvedValue(undefined) };
		vi.mocked(Motion.addListener).mockImplementation(async (_event, fn) => {
			listener = fn as unknown as AccelListener;
			return handle;
		});

		const onShake = vi.fn();
		startShakeListening(onShake);
		await vi.waitFor(() => expect(listener).toBeDefined());
		listener!({
			acceleration: { x: 0, y: 0, z: 0 },
			accelerationIncludingGravity: { x: 30, y: 30, z: 30 },
			rotationRate: { alpha: 0, beta: 0, gamma: 0 },
			interval: 16
		});

		expect(onShake).toHaveBeenCalledOnce();
	});

	it('ignores a native accel event with no real accelerometer data backing it — observed on an Android emulator before the first real reading arrives', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		let listener: AccelListener | undefined;
		vi.mocked(Motion.addListener).mockImplementation(async (_event, fn) => {
			listener = fn as unknown as AccelListener;
			return { remove: vi.fn().mockResolvedValue(undefined) };
		});

		const onShake = vi.fn();
		startShakeListening(onShake);
		await vi.waitFor(() => expect(listener).toBeDefined());
		listener!({
			acceleration: { x: 0, y: 0, z: 0 },
			accelerationIncludingGravity: {} as unknown as { x: number; y: number; z: number },
			rotationRate: { alpha: 0, beta: 0, gamma: 0 },
			interval: 16
		});

		expect(onShake).not.toHaveBeenCalled();
	});

	it('stopShakeListening removes the native Motion listener', async () => {
		vi.mocked(isNativePlatform).mockReturnValue(true);
		const handle = { remove: vi.fn().mockResolvedValue(undefined) };
		vi.mocked(Motion.addListener).mockResolvedValue(handle);

		startShakeListening(() => {});
		await vi.waitFor(() => expect(Motion.addListener).toHaveBeenCalled());
		await Promise.resolve();
		stopShakeListening();

		expect(handle.remove).toHaveBeenCalledOnce();
	});

	it('startShakeListening replaces a previously-running listener', () => {
		startShakeListening(() => {});
		const onShake = vi.fn();
		startShakeListening(onShake);

		window.dispatchEvent(shakeEvent({ x: 30, y: 30, z: 30 }));

		expect(onShake).toHaveBeenCalledOnce();
	});

	it('startShakeListening on the web fires onShake for a strong devicemotion reading', () => {
		const onShake = vi.fn();
		startShakeListening(onShake);

		window.dispatchEvent(shakeEvent({ x: 30, y: 30, z: 30 }));

		expect(onShake).toHaveBeenCalledOnce();
	});

	it('ignores a devicemotion event with no accelerationIncludingGravity at all', () => {
		const onShake = vi.fn();
		startShakeListening(onShake);

		window.dispatchEvent(shakeEvent(null));

		expect(onShake).not.toHaveBeenCalled();
	});

	it('ignores a devicemotion event missing the x axis', () => {
		const onShake = vi.fn();
		startShakeListening(onShake);

		window.dispatchEvent(shakeEvent({ x: null, y: 30, z: 30 }));

		expect(onShake).not.toHaveBeenCalled();
	});

	it('ignores a devicemotion event missing the y axis', () => {
		const onShake = vi.fn();
		startShakeListening(onShake);

		window.dispatchEvent(shakeEvent({ x: 30, y: null, z: 30 }));

		expect(onShake).not.toHaveBeenCalled();
	});

	it('ignores a devicemotion event missing the z axis', () => {
		const onShake = vi.fn();
		startShakeListening(onShake);

		window.dispatchEvent(shakeEvent({ x: 30, y: 30, z: null }));

		expect(onShake).not.toHaveBeenCalled();
	});

	it('stopShakeListening removes the devicemotion listener', () => {
		const onShake = vi.fn();
		startShakeListening(onShake);
		stopShakeListening();

		window.dispatchEvent(shakeEvent({ x: 30, y: 30, z: 30 }));

		expect(onShake).not.toHaveBeenCalled();
	});

	it('stopShakeListening is safe to call with nothing listening', () => {
		expect(() => stopShakeListening()).not.toThrow();
	});

	it('initShakeToUndo starts listening when the stored preference is on (the default)', () => {
		const onShake = vi.fn();
		initShakeToUndo(onShake);

		window.dispatchEvent(shakeEvent({ x: 30, y: 30, z: 30 }));

		expect(onShake).toHaveBeenCalledOnce();
	});

	it('initShakeToUndo does not start listening when the stored preference is off', () => {
		setShakeToUndoPreference(false);
		const onShake = vi.fn();
		initShakeToUndo(onShake);

		window.dispatchEvent(shakeEvent({ x: 30, y: 30, z: 30 }));

		expect(onShake).not.toHaveBeenCalled();
	});

	describe('iOS Safari (requestPermission API present)', () => {
		function stubRequestPermission(): void {
			(window.DeviceMotionEvent as unknown as { requestPermission: () => void }).requestPermission =
				vi.fn();
		}

		it('getShakeToUndoPreference defaults to disabled when nothing is stored', () => {
			stubRequestPermission();

			expect(getShakeToUndoPreference()).toBe(false);
		});

		it('an explicit "on" from a past session still reads as enabled', () => {
			stubRequestPermission();
			setShakeToUndoPreference(true);

			expect(getShakeToUndoPreference()).toBe(true);
		});

		it('initShakeToUndo does not auto-start on mount, even when the stored preference is on', () => {
			stubRequestPermission();
			setShakeToUndoPreference(true);
			const onShake = vi.fn();

			initShakeToUndo(onShake);

			window.dispatchEvent(shakeEvent({ x: 30, y: 30, z: 30 }));
			expect(onShake).not.toHaveBeenCalled();
		});

		it('shakeNeedsRepromptThisSession is true when enabled but nothing is listening yet', () => {
			stubRequestPermission();
			setShakeToUndoPreference(true);

			expect(shakeNeedsRepromptThisSession()).toBe(true);
		});

		it('shakeNeedsRepromptThisSession is false once the listener is actually running', () => {
			stubRequestPermission();
			setShakeToUndoPreference(true);
			startShakeListening(() => {});

			expect(shakeNeedsRepromptThisSession()).toBe(false);
		});

		it('shakeNeedsRepromptThisSession is false when the preference is off', () => {
			stubRequestPermission();
			setShakeToUndoPreference(false);

			expect(shakeNeedsRepromptThisSession()).toBe(false);
		});
	});
});
