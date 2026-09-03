import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	BiometryErrorType,
	BiometryType,
	CheckBiometryResult
} from '@aparajita/capacitor-biometric-auth';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }));
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
	BiometricAuth: { checkBiometry: vi.fn(), authenticate: vi.fn() },
	BiometryError: class extends Error {
		code: string;
		constructor(message: string, code: string) {
			super(message);
			this.code = code;
		}
	},
	BiometryErrorType: {
		none: '',
		appCancel: 'appCancel',
		authenticationFailed: 'authenticationFailed',
		invalidContext: 'invalidContext',
		notInteractive: 'notInteractive',
		passcodeNotSet: 'passcodeNotSet',
		systemCancel: 'systemCancel',
		userCancel: 'userCancel',
		userFallback: 'userFallback',
		biometryLockout: 'biometryLockout',
		biometryNotAvailable: 'biometryNotAvailable',
		biometryNotEnrolled: 'biometryNotEnrolled',
		noDeviceCredential: 'noDeviceCredential'
	},
	BiometryType: {
		none: 0,
		touchId: 1,
		faceId: 2,
		fingerprintAuthentication: 3,
		faceAuthentication: 4,
		irisAuthentication: 5
	}
}));

const { Capacitor } = await import('@capacitor/core');
const isNativePlatform = Capacitor.isNativePlatform;
// Value aliases (…Plugin*) — the type names stay unaliased above so
// annotations read naturally; the runtime objects come from the mock.
const {
	BiometricAuth,
	BiometryError,
	BiometryErrorType: ErrorTypePlugin,
	BiometryType: TypePlugin
} = await import('@aparajita/capacitor-biometric-auth');
const { authenticateWithBiometrics, checkBiometry } = await import('./biometrics');

function biometryInfo(
	overrides: { isAvailable?: boolean; biometryType?: BiometryType } = {}
): CheckBiometryResult {
	return {
		isAvailable: false,
		strongBiometryIsAvailable: false,
		biometryType: TypePlugin.none,
		biometryTypes: [],
		deviceIsSecure: false,
		reason: '',
		code: '' as BiometryErrorType,
		...overrides
	};
}

function nativePlatform() {
	vi.stubGlobal('window', {});
	vi.mocked(isNativePlatform).mockReturnValue(true);
}

// Runs in the "server" (node) project, which has no `window` — the no-window
// rows of the matrix are real, and the web/native rows stub one in. See
// PasscodeGate.svelte.spec.ts for the component-level behavior on top of
// these exports.
describe('biometrics (no window)', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
		vi.mocked(isNativePlatform).mockReturnValue(false);
	});

	it('checkBiometry reports unavailable without calling the plugin', async () => {
		await expect(checkBiometry()).resolves.toEqual({ available: false, biometryType: 'none' });
		expect(BiometricAuth.checkBiometry).not.toHaveBeenCalled();
	});

	it('authenticateWithBiometrics reports unavailable without calling the plugin', async () => {
		await expect(authenticateWithBiometrics('Unlock this list')).resolves.toBe('unavailable');
		expect(BiometricAuth.authenticate).not.toHaveBeenCalled();
	});
});

describe('biometrics (web)', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
		vi.mocked(isNativePlatform).mockReturnValue(false);
	});

	it('checkBiometry reports unavailable on a non-native platform', async () => {
		vi.stubGlobal('window', {});

		await expect(checkBiometry()).resolves.toEqual({ available: false, biometryType: 'none' });
		expect(BiometricAuth.checkBiometry).not.toHaveBeenCalled();
	});

	it('authenticateWithBiometrics reports unavailable on a non-native platform', async () => {
		vi.stubGlobal('window', {});

		await expect(authenticateWithBiometrics('Unlock this list')).resolves.toBe('unavailable');
		expect(BiometricAuth.authenticate).not.toHaveBeenCalled();
	});
});

describe('biometrics (native)', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
		vi.mocked(isNativePlatform).mockReturnValue(false);
	});

	it('checkBiometry maps an available Face ID device', async () => {
		nativePlatform();
		vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue(
			biometryInfo({ isAvailable: true, biometryType: TypePlugin.faceId })
		);

		await expect(checkBiometry()).resolves.toEqual({ available: true, biometryType: 'face' });
	});

	it('checkBiometry reduces every plugin biometry type to its kind', async () => {
		nativePlatform();
		const cases: [BiometryType, 'fingerprint' | 'face' | 'iris' | 'none'][] = [
			[TypePlugin.touchId, 'fingerprint'],
			[TypePlugin.fingerprintAuthentication, 'fingerprint'],
			[TypePlugin.faceId, 'face'],
			[TypePlugin.faceAuthentication, 'face'],
			[TypePlugin.irisAuthentication, 'iris'],
			[TypePlugin.none, 'none']
		];

		for (const [pluginType, kind] of cases) {
			vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue(
				biometryInfo({ isAvailable: true, biometryType: pluginType })
			);
			await expect(checkBiometry()).resolves.toEqual({ available: true, biometryType: kind });
		}
	});

	it('checkBiometry keeps the kind but reports unavailable when biometry is not enrolled', async () => {
		nativePlatform();
		vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue(
			biometryInfo({ isAvailable: false, biometryType: TypePlugin.fingerprintAuthentication })
		);

		await expect(checkBiometry()).resolves.toEqual({
			available: false,
			biometryType: 'fingerprint'
		});
	});

	it('checkBiometry maps an unknown plugin type to none', async () => {
		nativePlatform();
		vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue(
			biometryInfo({ isAvailable: true, biometryType: 99 as BiometryType })
		);

		await expect(checkBiometry()).resolves.toEqual({ available: true, biometryType: 'none' });
	});

	it('checkBiometry reports unavailable when the plugin check rejects', async () => {
		nativePlatform();
		vi.mocked(BiometricAuth.checkBiometry).mockRejectedValue(new Error('plugin crashed'));

		await expect(checkBiometry()).resolves.toEqual({ available: false, biometryType: 'none' });
	});

	it('authenticateWithBiometrics resolves to success and passes the locked-decision options', async () => {
		nativePlatform();
		vi.mocked(BiometricAuth.authenticate).mockResolvedValue(undefined);

		await expect(authenticateWithBiometrics('Unlock this list')).resolves.toBe('success');
		expect(BiometricAuth.authenticate).toHaveBeenCalledWith({
			reason: 'Unlock this list',
			allowDeviceCredential: false,
			iosFallbackTitle: ''
		});
	});

	it.each([ErrorTypePlugin.userCancel, ErrorTypePlugin.appCancel, ErrorTypePlugin.systemCancel])(
		'authenticateWithBiometrics maps %s to cancelled',
		async (code) => {
			nativePlatform();
			vi.mocked(BiometricAuth.authenticate).mockRejectedValue(new BiometryError('cancelled', code));

			await expect(authenticateWithBiometrics('Unlock this list')).resolves.toBe('cancelled');
		}
	);

	it.each([
		ErrorTypePlugin.authenticationFailed,
		ErrorTypePlugin.biometryLockout,
		ErrorTypePlugin.biometryNotAvailable,
		ErrorTypePlugin.passcodeNotSet
	])('authenticateWithBiometrics maps %s to failed', async (code) => {
		nativePlatform();
		vi.mocked(BiometricAuth.authenticate).mockRejectedValue(new BiometryError('failed', code));

		await expect(authenticateWithBiometrics('Unlock this list')).resolves.toBe('failed');
	});

	it('authenticateWithBiometrics maps a non-BiometryError rejection to failed', async () => {
		nativePlatform();
		vi.mocked(BiometricAuth.authenticate).mockRejectedValue(new Error('something else'));

		await expect(authenticateWithBiometrics('Unlock this list')).resolves.toBe('failed');
	});
});
