import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The token module's storage behavior is covered directly by token.spec.ts /
// token.svelte.spec.ts; here it's faked so tests can assert on the calls.
let fakeToken: string | null = null;
vi.mock('./token', () => ({
	getToken: () => fakeToken,
	setToken: (token: string) => {
		fakeToken = token;
	},
	clearToken: () => {
		fakeToken = null;
	}
}));

const apiPost = vi.fn();
const apiFetch = vi.fn();
const setUnauthorizedCoordinator = vi.fn();
vi.mock('./client', () => ({
	apiPost: (...args: unknown[]) => apiPost(...args),
	apiFetch: (...args: unknown[]) => apiFetch(...args),
	setUnauthorizedCoordinator: (...args: unknown[]) => setUnauthorizedCoordinator(...args)
}));

// The server (Node) project has no window/localStorage — install a minimal shim matching what
// the browser project provides natively, so the specs (and the module's own storage access)
// behave identically in both projects. In the browser project the real localStorage is used, so
// every timestamp assertion below goes through window.localStorage, which is the exact storage
// markRotation() writes in both projects.
const storage = new Map<string, string>();
const localStorageShim = {
	getItem: (key: string) => storage.get(key) ?? null,
	setItem: (key: string, value: string) => void storage.set(key, value),
	removeItem: (key: string) => void storage.delete(key),
	clear: () => void storage.clear()
};
/** Reads the timestamp the module persisted — via the shim on Node, via real localStorage in the
 * browser project. */
function readStoredRotation(): string | null {
	return (globalThis.window.localStorage as Storage).getItem(LAST_ROTATION_KEY);
}
function writeStoredRotation(value: string | null): void {
	const s = globalThis.window.localStorage as Storage;
	if (value === null) s.removeItem(LAST_ROTATION_KEY);
	else s.setItem(LAST_ROTATION_KEY, value);
}
// Original descriptors saved so the Node-project shims are removed in teardown — a later spec
// sharing this environment must not observe these browser globals.
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
if (typeof globalThis.localStorage === 'undefined') {
	Object.defineProperty(globalThis, 'localStorage', { value: localStorageShim });
}
if (typeof globalThis.window === 'undefined') {
	Object.defineProperty(globalThis, 'window', {
		value: { localStorage: localStorageShim } as unknown as Window & typeof globalThis,
		writable: true,
		configurable: true
	});
}

const { rotateToken, startAuthRotation, resetAuthRotationForTesting } =
	await import('./auth-rotation');

const ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_SETTLE_MS = 10_000;
const LAST_ROTATION_KEY = 'everylist:token-rotated-at';

describe('rotateToken', () => {
	beforeEach(() => {
		apiPost.mockReset();
		apiPost.mockResolvedValue({ token: 'new-token' });
		apiFetch.mockReset();
		apiFetch.mockResolvedValue({ token: 'new-token' });
		fakeToken = null;
		(globalThis.window.localStorage as Storage).clear();
		// Also clears the module's in-memory rotation timestamp between specs.
		resetAuthRotationForTesting();
	});

	it('posts to the refresh endpoint and stores the returned token when due', async () => {
		fakeToken = 'old-token';
		// No stored rotation timestamp → due immediately.
		await rotateToken();

		expect(apiFetch).toHaveBeenCalledWith(
			'/api/v1/account/refresh',
			{ method: 'POST' },
			{ bypass401Coordinator: true }
		);
		expect(fakeToken).toBe('new-token');
		expect(Number(readStoredRotation())).toBeGreaterThan(0);
	});

	it('does nothing when there is no stored token', async () => {
		await rotateToken();

		expect(apiFetch).not.toHaveBeenCalled();
	});

	it('skips the request when a rotation happened within the interval', async () => {
		fakeToken = 'old-token';
		writeStoredRotation(String(Date.now() - 1000));

		await rotateToken();

		expect(apiFetch).not.toHaveBeenCalled();
	});

	it('rotates when the last rotation is older than the interval', async () => {
		fakeToken = 'old-token';
		writeStoredRotation(String(Date.now() - ROTATION_INTERVAL_MS - 1));

		await rotateToken();

		expect(apiFetch).toHaveBeenCalledWith(
			'/api/v1/account/refresh',
			{ method: 'POST' },
			{ bypass401Coordinator: true }
		);
		expect(fakeToken).toBe('new-token');
	});

	it('does not update the timestamp when the rotation fails (retried on the next trigger)', async () => {
		fakeToken = 'old-token';
		apiFetch.mockRejectedValue(new Error('network error'));

		await expect(rotateToken()).resolves.toBeUndefined();

		expect(fakeToken).toBe('old-token');
		expect(readStoredRotation()).toBeNull();
	});

	it('does not update the timestamp when the session was replaced mid-request', async () => {
		fakeToken = 'old-token';
		apiFetch.mockImplementation(async () => {
			// A different session's token replaced this one while the refresh was in flight.
			fakeToken = 'other-login-token';
			return { token: 'new-token' };
		});

		await rotateToken();

		expect(fakeToken).toBe('other-login-token');
		expect(readStoredRotation()).toBeNull();
	});

	it('discards the rotated token when the session was cleared mid-request (logout racing the refresh)', async () => {
		fakeToken = 'old-token';
		apiFetch.mockImplementation(async () => {
			// A concurrent logout (or a 401 elsewhere) clears the token while the
			// refresh request is in flight.
			fakeToken = null;
			return { token: 'new-token' };
		});

		await rotateToken();

		expect(apiFetch).toHaveBeenCalledWith(
			'/api/v1/account/refresh',
			{ method: 'POST' },
			{ bypass401Coordinator: true }
		);
		expect(fakeToken).toBeNull();
	});

	it('treats a corrupt stored timestamp as "never rotated"', async () => {
		fakeToken = 'old-token';
		writeStoredRotation('not-a-number');

		await rotateToken();

		expect(apiFetch).toHaveBeenCalledWith(
			'/api/v1/account/refresh',
			{ method: 'POST' },
			{ bypass401Coordinator: true }
		);
		expect(fakeToken).toBe('new-token');
	});

	it('sends no refresh during SSR/prerender because there is no stored token', async () => {
		// SSR/prerender has no browser storage: the real getToken() returns null there. The
		// token mock mirrors that by clearing the token while window is absent.
		const hadWindow = 'window' in (globalThis as unknown as Record<string, unknown>);
		const saved = (globalThis as unknown as Record<string, unknown>)['window'];
		if (hadWindow) Reflect.deleteProperty(globalThis, 'window');
		const tokenDuringSsr = fakeToken;
		fakeToken = null;
		try {
			await rotateToken();
		} finally {
			fakeToken = tokenDuringSsr;
			if (hadWindow)
				Object.defineProperty(globalThis, 'window', {
					value: saved,
					writable: true,
					configurable: true
				});
		}

		expect(apiFetch).not.toHaveBeenCalled();
	});

	it('treats a missing window (SSR) as "never rotated" when a token is somehow present', async () => {
		// Defensive belt-and-suspenders for the unreachable-in-practice case of a token being
		// readable while window is absent (the token mock is window-independent): the module
		// treats the missing storage as "never rotated" and attempts the due rotation, storing
		// nothing.
		fakeToken = 'old-token';
		const hadWindow = 'window' in (globalThis as unknown as Record<string, unknown>);
		const saved = (globalThis as unknown as Record<string, unknown>)['window'];
		if (hadWindow) Reflect.deleteProperty(globalThis, 'window');
		try {
			await rotateToken();
		} finally {
			if (hadWindow)
				Object.defineProperty(globalThis, 'window', {
					value: saved,
					writable: true,
					configurable: true
				});
		}

		expect(apiFetch).toHaveBeenCalledWith(
			'/api/v1/account/refresh',
			{ method: 'POST' },
			{ bypass401Coordinator: true }
		);
		expect(readStoredRotation()).toBeNull();
	});

	it('survives a timestamp-write failure by gating the session in memory', async () => {
		fakeToken = 'old-token';
		// The shim's own setItem is swappable in both projects (an own property of the shim
		// object); the browser project's native localStorage needs a fresh own property.
		const shim = globalThis.window.localStorage as unknown as Record<string, unknown>;
		const originalSetItem = shim['setItem'];
		shim['setItem'] = () => {
			throw new Error('quota exceeded');
		};

		try {
			await rotateToken();

			expect(apiFetch).toHaveBeenCalledWith(
				'/api/v1/account/refresh',
				{ method: 'POST' },
				{ bypass401Coordinator: true }
			);
			expect(fakeToken).toBe('new-token');
			// The persisted write failed; nothing landed in storage.
			expect(readStoredRotation()).toBeNull();

			// The in-memory fallback must still gate this session's later triggers.
			await rotateToken();
			expect(apiFetch).toHaveBeenCalledTimes(1);
		} finally {
			shim['setItem'] = originalSetItem;
		}
	});

	it('skips the attempt entirely while another rotation is already in flight', async () => {
		fakeToken = 'old-token';
		let release!: (value: { token: string }) => void;
		apiPost.mockReturnValue(
			new Promise<{ token: string }>((resolve) => {
				release = resolve;
			})
		);

		const first = rotateToken();
		// A second trigger (e.g. the visibility listener firing while the first request is
		// still pending) must not send the same token again.
		const second = rotateToken();
		expect(apiFetch).toHaveBeenCalledTimes(1);
		void second;

		release({ token: 'new-token' });
		await first;

		expect(apiFetch).toHaveBeenCalledTimes(1);
		expect(fakeToken).toBe('new-token');
	});

	it('registers itself as the 401 coordinator on import', async () => {
		expect(setUnauthorizedCoordinator).toHaveBeenCalledWith(expect.any(Function));
	});

	it('sends the refresh through apiFetch with bypass401Coordinator, resolving on a refresh 401', async () => {
		// The refresh request is the rotation itself — a 401 from it (expired/revoked token)
		// must not park on its own coordination (that would deadlock the rotation) and must
		// never clear the stored token out from under the parked straggler 401s (the settle
		// step decides their outcome). The bypass drops it into apiFetch's plain path.
		fakeToken = 'old-token';
		let rejectRefresh!: (reason: { status: number; message: string; body: unknown }) => void;
		apiFetch.mockReturnValue(
			new Promise<never>((_resolve, reject) => {
				rejectRefresh = reject;
			})
		);

		const rotation = rotateToken();
		expect(apiFetch).toHaveBeenCalledWith(
			'/api/v1/account/refresh',
			{ method: 'POST' },
			{ bypass401Coordinator: true }
		);

		// A refresh-401 rejection is swallowed by rotateToken (best-effort) and resolves.
		rejectRefresh({ status: 401, message: 'Unauthorized', body: undefined });
		await expect(rotation).resolves.toBeUndefined();
		// The failed rotation must not have marked a timestamp — the next trigger retries.
		expect(readStoredRotation()).toBeNull();
	});

	it('defers a 401 racing the rotation until it settles, keeping the replacement', async () => {
		fakeToken = 'old-token';

		let releaseRotation!: (value: { token: string }) => void;
		apiFetch.mockReturnValue(
			new Promise<{ token: string }>((resolve) => {
				releaseRotation = resolve;
			})
		);

		const rotation = rotateToken();
		// A straggler request, sent with the same token before the rotation revoked it, gets
		// its 401 first — its clear decision is now deferred.
		const deferred = (
			setUnauthorizedCoordinator.mock.calls[0]?.[0] as (t: string | null) => unknown
		)('old-token');
		await Promise.resolve();
		expect(fakeToken).toBe('old-token');

		// The rotation lands and stores its replacement.
		releaseRotation({ token: 'new-token' });
		await rotation;
		expect(fakeToken).toBe('new-token');

		// The deferred 401 decision resolves as "don't clear" (rotation succeeded).
		await expect(Promise.resolve(deferred)).resolves.toBe(false);
		expect(fakeToken).toBe('new-token');
	});

	it('coordinates the 401: rotation success keeps the replacement', async () => {
		// Drive the real coordinator (resetAuthRotationForTesting cleared the mock's own
		// bookkeeping, but the module registered the real function at import time — pull the
		// registered one back out and call it directly).
		fakeToken = 'old-token';
		let releaseRotation!: (value: { token: string }) => void;
		apiFetch.mockReturnValue(
			new Promise<{ token: string }>((resolve) => {
				releaseRotation = resolve;
			})
		);

		const rotation = rotateToken();
		const coordinator = setUnauthorizedCoordinator.mock.calls[0]?.[0] as (
			token: string | null
		) => Promise<boolean>;

		// A 401 for the token being rotated → deferred decision.
		const decision = coordinator('old-token');
		const state = { settled: false };
		void decision.then(() => {
			state.settled = true;
		});
		await Promise.resolve();
		expect(state.settled).toBe(false);

		// Rotation succeeds → the replacement is stored and the 401 must not clear it.
		releaseRotation({ token: 'new-token' });
		await rotation;
		await expect(decision).resolves.toBe(false);
		expect(fakeToken).toBe('new-token');
		// (The failure half — a failed rotation telling a parked 401 to clear after all — is
		// covered by 'tells a deferred 401 to clear when the rotation failed' below; a
		// second rotation in this same spec would be gated off by rotationDue() anyway.)
	});

	it('does not defer a 401 for a token that is not the one being rotated', async () => {
		fakeToken = 'old-token';
		let releaseRotation!: (value: { token: string }) => void;
		apiFetch.mockReturnValue(
			new Promise<{ token: string }>((resolve) => {
				releaseRotation = resolve;
			})
		);

		const rotation = rotateToken();
		const coordinator = setUnauthorizedCoordinator.mock.calls[0]?.[0] as (
			token: string | null
		) => boolean | Promise<boolean>;

		// A 401 for a different (stale) token → immediate, uncoordinated decision.
		expect(coordinator('an-older-token')).toBe(true);
		// A 401 with no token at all → likewise immediate.
		expect(coordinator(null)).toBe(true);

		releaseRotation({ token: 'new-token' });
		await rotation;
	});

	it('does not defer a 401 when no rotation is in flight at all', async () => {
		// No rotateToken() call — rotatingToken is null, so the coordinator is a pure
		// pass-through (the plain stored-token comparison in apiFetch is authoritative).
		fakeToken = 'old-token';
		const coordinator = setUnauthorizedCoordinator.mock.calls[0]?.[0] as (
			token: string | null
		) => boolean | Promise<boolean>;

		expect(coordinator('old-token')).toBe(true);
	});

	it('tells a deferred 401 to clear when the rotation failed', async () => {
		fakeToken = 'old-token';
		let failRotation!: (reason: unknown) => void;
		apiFetch.mockReturnValue(
			new Promise<{ token: string }>((_resolve, reject) => {
				failRotation = reject;
			})
		);

		const rotation = rotateToken();
		const coordinator = setUnauthorizedCoordinator.mock.calls[0]?.[0] as (
			token: string | null
		) => Promise<boolean>;
		const decision = coordinator('old-token');
		failRotation(new Error('offline'));
		await expect(rotation).resolves.toBeUndefined();
		// The rotation failed without storing a replacement — the old token is really dead,
		// so the deferred 401 proceeds with its clear.
		await expect(decision).resolves.toBe(true);
		expect(fakeToken).toBe('old-token');
	});
});

describe('startAuthRotation', () => {
	beforeEach(() => {
		apiPost.mockReset();
		apiPost.mockResolvedValue({ token: 'new-token' });
		apiFetch.mockReset();
		apiFetch.mockResolvedValue({ token: 'new-token' });
		fakeToken = null;
		(globalThis.window.localStorage as Storage).clear();
		// Clears the module's in-memory rotation timestamp between specs.
		resetAuthRotationForTesting();
		vi.useFakeTimers();
		vi.setSystemTime(1_700_000_000_000);
		(globalThis as { window?: unknown }).window = Object.assign(new EventTarget(), {
			localStorage: localStorageShim
		});
		(globalThis as { document?: unknown }).document = new EventTarget() as Document;
	});

	afterEach(() => {
		resetAuthRotationForTesting();
		vi.useRealTimers();
	});

	function fireVisibilityChange(state: 'visible' | 'hidden'): void {
		Object.defineProperty(globalThis.document, 'visibilityState', {
			value: state,
			configurable: true
		});
		(globalThis.document as unknown as EventTarget).dispatchEvent(new Event('visibilitychange'));
	}

	it('schedules a startup due check that fires after the settle delay', async () => {
		fakeToken = 'old-token';

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);
		// Still inside the settle window: mount-time data fetches are presumed in flight.
		expect(apiFetch).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(STARTUP_SETTLE_MS);
		expect(apiFetch).toHaveBeenCalledTimes(1);
		expect(fakeToken).toBe('new-token');
	});

	it('does not rotate at startup when the session was rotated within the interval', async () => {
		fakeToken = 'old-token';
		writeStoredRotation(String(Date.now() - 1000));

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(STARTUP_SETTLE_MS);

		expect(apiFetch).not.toHaveBeenCalled();
	});

	it('does nothing at startup when logged out', async () => {
		startAuthRotation();
		await vi.advanceTimersByTimeAsync(STARTUP_SETTLE_MS);

		expect(apiFetch).not.toHaveBeenCalled();
	});

	it('rotates on the daily interval tick once due', async () => {
		fakeToken = 'old-token';

		startAuthRotation();
		// The first tick fires a full interval after start (the settle-delayed startup check
		// and this tick can both be due; rotationDue makes the later one a no-op either way).
		await vi.advanceTimersByTimeAsync(STARTUP_SETTLE_MS);
		expect(apiFetch).toHaveBeenCalledTimes(1);
		expect(fakeToken).toBe('new-token');

		// A tick at one interval after start (24h) is only 24h-10s after the last rotation —
		// inside the interval, so it skips...
		await vi.advanceTimersByTimeAsync(ROTATION_INTERVAL_MS);
		expect(apiFetch).toHaveBeenCalledTimes(1);

		// ...but the next tick (48h) is a full interval past the rotation and rotates again.
		await vi.advanceTimersByTimeAsync(ROTATION_INTERVAL_MS);
		expect(apiFetch).toHaveBeenCalledTimes(2);
		expect(fakeToken).toBe('new-token');
	});

	it('does not rotate on the daily tick when logged out', async () => {
		startAuthRotation();
		await vi.advanceTimersByTimeAsync(STARTUP_SETTLE_MS + ROTATION_INTERVAL_MS);

		expect(apiFetch).not.toHaveBeenCalled();
	});

	it('rotates on returning to the foreground when due', async () => {
		fakeToken = 'old-token';
		writeStoredRotation(String(Date.now() - ROTATION_INTERVAL_MS - 1));

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);
		expect(apiFetch).not.toHaveBeenCalled();

		fireVisibilityChange('visible');
		await vi.advanceTimersByTimeAsync(0);
		expect(apiFetch).toHaveBeenCalledTimes(1);
	});

	it('does not rotate on returning to the foreground while inside the interval', async () => {
		fakeToken = 'old-token';
		writeStoredRotation(String(Date.now() - 1000));

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);

		fireVisibilityChange('visible');
		await vi.advanceTimersByTimeAsync(0);
		expect(apiFetch).not.toHaveBeenCalled();
	});

	it('does not rotate when the document becomes hidden', async () => {
		fakeToken = 'old-token';
		writeStoredRotation(String(Date.now() - ROTATION_INTERVAL_MS - 1));

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);
		expect(apiFetch).not.toHaveBeenCalled();

		fireVisibilityChange('hidden');
		await vi.advanceTimersByTimeAsync(0);
		expect(apiFetch).not.toHaveBeenCalled();
	});

	it('is idempotent — a second start does not register more work', async () => {
		fakeToken = 'old-token';
		writeStoredRotation(String(Date.now() - ROTATION_INTERVAL_MS - 1));

		startAuthRotation();
		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);
		fireVisibilityChange('visible');
		await vi.advanceTimersByTimeAsync(0);

		expect(apiFetch).toHaveBeenCalledTimes(1);
	});

	it('resetAuthRotationForTesting clears the stored rotation timestamp', () => {
		writeStoredRotation('123');
		resetAuthRotationForTesting();
		expect(readStoredRotation()).toBeNull();
	});

	it('resetAuthRotationForTesting is safe to call when nothing was started', () => {
		expect(() => resetAuthRotationForTesting()).not.toThrow();
	});
});

describe('startAuthRotation without a window (SSR/prerender)', () => {
	it('is a no-op', () => {
		const globalRecord = globalThis as unknown as Record<string, unknown>;
		const hadWindow = 'window' in globalRecord;
		const savedWindow = globalRecord['window'];
		const hadDocument = 'document' in globalRecord;
		const savedDocument = globalRecord['document'];
		if (hadWindow) Reflect.deleteProperty(globalThis, 'window');
		if (hadDocument) Reflect.deleteProperty(globalThis, 'document');
		try {
			expect(() => startAuthRotation()).not.toThrow();
		} finally {
			if (hadWindow)
				Object.defineProperty(globalThis, 'window', {
					value: savedWindow,
					writable: true,
					configurable: true
				});
			if (hadDocument)
				Object.defineProperty(globalThis, 'document', {
					value: savedDocument,
					writable: true,
					configurable: true
				});
		}
	});
});

afterAll(() => {
	// Restore the Node-project shims so a later spec sharing this environment doesn't observe
	// browser globals it didn't install.
	if (originalWindowDescriptor) {
		Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
	} else {
		Reflect.deleteProperty(globalThis, 'window');
	}
	if (originalLocalStorageDescriptor) {
		Object.defineProperty(globalThis, 'localStorage', originalLocalStorageDescriptor);
	} else {
		Reflect.deleteProperty(globalThis, 'localStorage');
	}
});
