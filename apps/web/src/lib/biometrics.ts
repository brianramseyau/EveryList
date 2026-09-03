/**
 * Native biometric authentication for passcode-protected lists
 * (PLAN_23_PHASE_BIOMETRIC_UNLOCK.md) — a second way to produce the same
 * unlock signal the PIN form produces, not a new unlock mechanism. Biometric
 * success maps to PasscodeGate's `onunlock()` exactly like a correct PIN;
 * nothing about the passcode itself (a client-side SHA-256 gate, see
 * $lib/passcode.ts) changes, and the list PIN remains the fallback credential.
 *
 * Shared-device multi-biometry (several enrolled faces/fingers belonging to
 * different people) is out of scope by design: the passcode is a local
 * deterrent, and any biometric the device accepts is accepted, full stop.
 *
 * Web/PWA/Electron builds never touch the plugin — every export returns its
 * "unavailable" shape unless `Capacitor.isNativePlatform()`, so behavior there
 * is unchanged, PIN only.
 */
import { Capacitor } from '@capacitor/core';
// Provably covered (biometrics.spec.ts exercises every path in this file) —
// the same Vitest coverage-collection artifact documented on
// `lib/api/selected-store.ts` and `lib/orientation.ts` can attribute a
// phantom, permanently-uninvoked function entry to this import statement
// whenever a browser-mode spec loads this module alongside a vi.mock of the
// plugin, so it's ignored up front rather than re-chased per suite.
/* v8 ignore start */
import { BiometricAuth, BiometryError, BiometryType } from '@aparajita/capacitor-biometric-auth';
/* v8 ignore stop */

/** What `authenticateWithBiometrics` actually did — never throws. */
export type BiometricAuthResult = 'success' | 'cancelled' | 'failed' | 'unavailable';

/** The device biometry the gate's prompt copy names, reduced from the
 * plugin's per-platform `BiometryType` enum (iOS Touch ID/Face ID and Android
 * fingerprint/face/iris). `none` covers every unavailable/no-biometry case. */
export type BiometryKind = 'fingerprint' | 'face' | 'iris' | 'none';

export interface BiometryAvailability {
	available: boolean;
	biometryType: BiometryKind;
}

const UNAVAILABLE: BiometryAvailability = { available: false, biometryType: 'none' };

/** Guards every browser API access — this module runs during prerendering
 * (Node, no `window`) as well as in the browser, like $lib/theme.ts and
 * $lib/orientation.ts. */
function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

function toBiometryKind(type: BiometryType): BiometryKind {
	switch (type) {
		case BiometryType.touchId:
		case BiometryType.fingerprintAuthentication:
			return 'fingerprint';
		case BiometryType.faceId:
		case BiometryType.faceAuthentication:
			return 'face';
		case BiometryType.irisAuthentication:
			return 'iris';
		default:
			return 'none';
	}
}

/** Whether biometric authentication is available right now — the device is
 * native (Capacitor) and the user has enrolled at least weak biometry.
 * False on web/PWA/Electron (no native plugin), without a `window`
 * (prerendering), or if the plugin check itself fails — the gate treats all
 * three identically: show the PIN form, never prompt. */
export async function checkBiometry(): Promise<BiometryAvailability> {
	if (!hasWindow()) return UNAVAILABLE;
	if (!Capacitor.isNativePlatform()) return UNAVAILABLE;
	try {
		const info = await BiometricAuth.checkBiometry();
		return { available: info.isAvailable, biometryType: toBiometryKind(info.biometryType) };
	} catch {
		return UNAVAILABLE;
	}
}

/** Prompts the user with the system biometric sheet. Never throws: every
 * outcome is reported via the result so the gate can react honestly.
 *
 * - `'success'`: the device accepted a biometric — maps to the same
 *   `onunlock()` a correct PIN produces.
 * - `'cancelled'`: the user (or the app/system on their behalf) dismissed the
 *   prompt — falls back silently to the PIN form.
 * - `'failed'`: authentication genuinely failed (bad read, biometry lockout
 *   after repeated failures, …) — the gate shows an error above the PIN form.
 * - `'unavailable'`: not a native platform / no window, i.e. prompting was
 *   never possible — the gate stays on the PIN form.
 *
 * `allowDeviceCredential` stays false (the locked decision): the device PIN/
 * pattern never unlocks a list passcode — the list PIN is the fallback
 * credential. `iosFallbackTitle: ''` hides the system's post-failure fallback
 * button entirely; with device credentials disallowed it could only ever
 * produce a confusing dead-end `userFallback` error, and the list PIN form
 * sitting right below the gate is the actual fallback. */
export async function authenticateWithBiometrics(reason: string): Promise<BiometricAuthResult> {
	if (!hasWindow()) return 'unavailable';
	if (!Capacitor.isNativePlatform()) return 'unavailable';
	try {
		await BiometricAuth.authenticate({
			reason,
			allowDeviceCredential: false,
			iosFallbackTitle: ''
		});
		return 'success';
	} catch (error) {
		// BiometryError codes are stable strings across platforms (see the
		// plugin's BiometryErrorType); anything else the plugin might throw is
		// still a failure, not a crash.
		const code = error instanceof BiometryError ? error.code : '';
		if (code === 'userCancel' || code === 'appCancel' || code === 'systemCancel') {
			return 'cancelled';
		}
		return 'failed';
	}
}
