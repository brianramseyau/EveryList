import { Capacitor } from '@capacitor/core';
import { Motion } from '@capacitor/motion';
import type { PluginListenerHandle } from '@capacitor/core';

const STORAGE_KEY = 'everylist:shakeToUndo';
const STANDARD_GRAVITY = 9.80665;

/** Guards every browser API access, like $lib/orientation.ts and $lib/theme.ts — this module runs
 * during prerendering (Node, no `window`) as well as in the browser. */
function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

export function getShakeToUndoPreference(): boolean {
	if (!hasWindow()) return true;
	const stored = window.localStorage.getItem(STORAGE_KEY);
	return stored !== 'off';
}

export function setShakeToUndoPreference(enabled: boolean): void {
	if (!hasWindow()) return;
	window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
}

export interface ShakeDetectorOptions {
	/** How far a reading's magnitude (in units of standard gravity, g) must depart from the ~1g a
	 * stationary phone reads before it counts as a shake. */
	thresholdG?: number;
	/** Minimum time between two detected shakes, so one physical shake — which produces many
	 * readings above threshold in quick succession — fires `onShake` once, not a dozen times. */
	cooldownMs?: number;
}

const DEFAULT_THRESHOLD_G = 1.8;
const DEFAULT_COOLDOWN_MS = 1000;

/** Pure, sensor-agnostic shake detector: feed it acceleration-including-gravity readings in units
 * of g and it calls `onShake` at most once per `cooldownMs`. Kept independent of any sensor API so
 * it's unit-testable without a real accelerometer, and shared by both the native
 * (`@capacitor/motion`) and browser (`devicemotion`) listeners below — both report m/s², normalized
 * to g here so one threshold works for either source. */
export function createShakeDetector(onShake: () => void, options: ShakeDetectorOptions = {}) {
	const thresholdG = options.thresholdG ?? DEFAULT_THRESHOLD_G;
	const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
	let lastShakeAt = -Infinity;

	return {
		handleReading(x: number, y: number, z: number, now: number = Date.now()): void {
			const magnitudeG = Math.sqrt(x * x + y * y + z * z) / STANDARD_GRAVITY;
			if (Math.abs(magnitudeG - 1) < thresholdG) return;
			if (now - lastShakeAt < cooldownMs) return;
			lastShakeAt = now;
			onShake();
		}
	};
}

/** Whether `requestShakePermission` needs to actually prompt for anything — true only for iOS
 * Safari (native and Android never gate motion access behind a runtime permission). Settings uses
 * this to decide whether enabling the toggle needs a user-gesture-triggered request first. */
export function needsShakePermissionPrompt(): boolean {
	if (!hasWindow() || Capacitor.isNativePlatform()) return false;
	return (
		typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission ===
		'function'
	);
}

/** Must be called from a user gesture (e.g. the Settings toggle's own click handler) — iOS Safari
 * silently ignores `requestPermission()` calls made outside one. No-ops to `true` everywhere else
 * (native and Android need no such prompt). */
export async function requestShakePermission(): Promise<boolean> {
	if (!needsShakePermissionPrompt()) return true;
	const requestPermission = (
		DeviceMotionEvent as unknown as {
			requestPermission: () => Promise<'granted' | 'denied'>;
		}
	).requestPermission;
	try {
		return (await requestPermission()) === 'granted';
	} catch {
		return false;
	}
}

let nativeHandle: PluginListenerHandle | null = null;
let webListener: ((event: DeviceMotionEvent) => void) | null = null;

/** Starts listening for a shake, native (`@capacitor/motion`) or web (`devicemotion`) depending on
 * platform. Safe to call when permission was never granted (iOS Safari before the user has opted
 * in via Settings) — the listener just never fires, no error. Replaces any listener already
 * running. */
export function startShakeListening(onShake: () => void): void {
	stopShakeListening();
	const detector = createShakeDetector(onShake);

	if (Capacitor.isNativePlatform()) {
		void Motion.addListener('accel', (event) => {
			const g = event.accelerationIncludingGravity;
			if (!g || g.x == null || g.y == null || g.z == null) return;
			detector.handleReading(g.x, g.y, g.z);
		}).then((handle) => {
			nativeHandle = handle;
		});
		return;
	}

	if (!hasWindow()) return;
	webListener = (event: DeviceMotionEvent) => {
		const g = event.accelerationIncludingGravity;
		// Loose nulls: some WebViews (observed on an Android emulator) fire devicemotion
		// continuously but leave x/y/z as `undefined` rather than absent/`null` when no real
		// accelerometer data backs the event — `=== null` alone lets that slip through as NaN
		// math that silently never crosses the threshold.
		if (!g || g.x == null || g.y == null || g.z == null) return;
		detector.handleReading(g.x, g.y, g.z);
	};
	window.addEventListener('devicemotion', webListener);
}

export function stopShakeListening(): void {
	if (nativeHandle) {
		const handle = nativeHandle;
		nativeHandle = null;
		void handle.remove();
	}
	if (webListener && hasWindow()) {
		window.removeEventListener('devicemotion', webListener);
		webListener = null;
	}
}

/** Called from the root layout's `onMount`, alongside `initTheme`/`initAccent`/`initOrientation` —
 * starts listening immediately if the stored preference is on. Safe on iOS Safari even before
 * permission was ever granted (see `startShakeListening`); Settings' toggle is what actually
 * requests it, gated behind the user's own tap. */
export function initShakeToUndo(onShake: () => void): void {
	if (getShakeToUndoPreference()) startShakeListening(onShake);
}
