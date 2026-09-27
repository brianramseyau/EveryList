import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('./client', () => ({
	apiPost: (...args: unknown[]) => apiPost(...args)
}));

// The server (Node) project has no window/localStorage — install a minimal shim matching what
// the browser project provides natively, so the specs (and the module's own storage access)
// behave identically in both projects.
const storage = new Map<string, string>();
const localStorageShim = {
	getItem: (key: string) => storage.get(key) ?? null,
	setItem: (key: string, value: string) => void storage.set(key, value),
	removeItem: (key: string) => void storage.delete(key),
	clear: () => void storage.clear()
};
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
const LAST_ROTATION_KEY = 'everylist:token-rotated-at';

describe('rotateToken', () => {
	beforeEach(() => {
		apiPost.mockReset();
		apiPost.mockResolvedValue({ token: 'new-token' });
		fakeToken = null;
		storage.clear();
	});

	it('posts to the refresh endpoint and stores the returned token when due', async () => {
		fakeToken = 'old-token';
		// No stored rotation timestamp → due immediately.
		await rotateToken();

		expect(apiPost).toHaveBeenCalledWith('/api/v1/account/refresh');
		expect(fakeToken).toBe('new-token');
		expect(Number(storage.get(LAST_ROTATION_KEY))).toBeGreaterThan(0);
	});

	it('does nothing when there is no stored token', async () => {
		await rotateToken();

		expect(apiPost).not.toHaveBeenCalled();
	});

	it('skips the request when a rotation happened within the interval', async () => {
		fakeToken = 'old-token';
		storage.set(LAST_ROTATION_KEY, String(Date.now() - 1000));

		await rotateToken();

		expect(apiPost).not.toHaveBeenCalled();
	});

	it('rotates when the last rotation is older than the interval', async () => {
		fakeToken = 'old-token';
		storage.set(LAST_ROTATION_KEY, String(Date.now() - ROTATION_INTERVAL_MS - 1));

		await rotateToken();

		expect(apiPost).toHaveBeenCalledWith('/api/v1/account/refresh');
		expect(fakeToken).toBe('new-token');
	});

	it('does not update the timestamp when the rotation fails (retried on the next trigger)', async () => {
		fakeToken = 'old-token';
		apiPost.mockRejectedValue(new Error('network error'));

		await expect(rotateToken()).resolves.toBeUndefined();

		expect(fakeToken).toBe('old-token');
		expect(storage.get(LAST_ROTATION_KEY)).toBeUndefined();
	});

	it('does not update the timestamp when the session was replaced mid-request', async () => {
		fakeToken = 'old-token';
		apiPost.mockImplementation(async () => {
			// A different session's token replaced this one while the refresh was in flight.
			fakeToken = 'other-login-token';
			return { token: 'new-token' };
		});

		await rotateToken();

		expect(fakeToken).toBe('other-login-token');
		expect(storage.get(LAST_ROTATION_KEY)).toBeUndefined();
	});

	it('discards the rotated token when the session was cleared mid-request (logout racing the refresh)', async () => {
		fakeToken = 'old-token';
		apiPost.mockImplementation(async () => {
			// A concurrent logout (or a 401 elsewhere) clears the token while the
			// refresh request is in flight.
			fakeToken = null;
			return { token: 'new-token' };
		});

		await rotateToken();

		expect(apiPost).toHaveBeenCalledWith('/api/v1/account/refresh');
		expect(fakeToken).toBeNull();
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
		expect(apiPost).toHaveBeenCalledTimes(1);
		void second;

		release({ token: 'new-token' });
		await first;

		expect(apiPost).toHaveBeenCalledTimes(1);
		expect(fakeToken).toBe('new-token');
	});
});

describe('startAuthRotation', () => {
	beforeEach(() => {
		apiPost.mockReset();
		apiPost.mockResolvedValue({ token: 'new-token' });
		fakeToken = null;
		storage.clear();
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

	it('rotates immediately when the session has never been rotated', async () => {
		fakeToken = 'old-token';

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);

		expect(apiPost).toHaveBeenCalledTimes(1);
		expect(fakeToken).toBe('new-token');
	});

	it('does not rotate on start when the session was rotated within the interval', async () => {
		fakeToken = 'old-token';
		storage.set(LAST_ROTATION_KEY, String(Date.now() - 1000));

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);

		expect(apiPost).not.toHaveBeenCalled();
	});

	it('does nothing on start when logged out', async () => {
		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);

		expect(apiPost).not.toHaveBeenCalled();
	});

	it('checks again after the daily interval and rotates once due', async () => {
		fakeToken = 'old-token';

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPost).toHaveBeenCalledTimes(1);

		// The rotation timestamp is now stored; a tick strictly inside the interval must skip...
		await vi.advanceTimersByTimeAsync(ROTATION_INTERVAL_MS - 1000);
		expect(apiPost).toHaveBeenCalledTimes(1);

		// ...but the tick after the interval has passed rotates again.
		await vi.advanceTimersByTimeAsync(1000);
		expect(apiPost).toHaveBeenCalledTimes(2);
	});

	it('rotates on returning to the foreground when due', async () => {
		fakeToken = 'old-token';
		storage.set(LAST_ROTATION_KEY, String(Date.now() - ROTATION_INTERVAL_MS - 1));

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPost).toHaveBeenCalledTimes(1);

		fireVisibilityChange('visible');
		await vi.advanceTimersByTimeAsync(0);
		// The start attempt already rotated; the visibility trigger fires again but is still
		// within the (now updated) interval, so no second request.
		expect(apiPost).toHaveBeenCalledTimes(1);
	});

	it('does not rotate when the document becomes hidden', async () => {
		fakeToken = 'old-token';

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPost).toHaveBeenCalledTimes(1);

		fireVisibilityChange('hidden');
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPost).toHaveBeenCalledTimes(1);
	});

	it('is idempotent — a second start does not register more work', async () => {
		fakeToken = 'old-token';

		startAuthRotation();
		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);

		expect(apiPost).toHaveBeenCalledTimes(1);
	});

	it('resetAuthRotationForTesting clears the stored rotation timestamp', () => {
		storage.set(LAST_ROTATION_KEY, '123');
		resetAuthRotationForTesting();
		expect(storage.get(LAST_ROTATION_KEY)).toBeUndefined();
	});

	it('resetAuthRotationForTesting is safe to call when nothing was started', () => {
		expect(() => resetAuthRotationForTesting()).not.toThrow();
	});
});

describe('startAuthRotation without a window (SSR/prerender)', () => {
	it('is a no-op', () => {
		const { window: _w, ...rest } = globalThis as unknown as Record<string, unknown>;
		const hadWindow = 'window' in (globalThis as unknown as Record<string, unknown>);
		// Reflect.deleteProperty bypasses the shim's non-configurable risk; restore after.
		if (hadWindow) Reflect.deleteProperty(globalThis, 'window');
		const hadDocument = 'document' in (globalThis as unknown as Record<string, unknown>);
		if (hadDocument) Reflect.deleteProperty(globalThis, 'document');
		try {
			expect(() => startAuthRotation()).not.toThrow();
		} finally {
			if (hadWindow)
				Object.defineProperty(globalThis, 'window', {
					value: _w,
					writable: true,
					configurable: true
				});
			if (hadDocument)
				Object.defineProperty(globalThis, 'document', {
					value: rest['document'],
					writable: true,
					configurable: true
				});
		}
	});
});
