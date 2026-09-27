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

const { rotateToken, startAuthRotation, resetAuthRotationForTesting } =
	await import('./auth-rotation');

describe('rotateToken', () => {
	beforeEach(() => {
		apiPost.mockReset();
		fakeToken = null;
	});

	it('posts to the refresh endpoint and stores the returned token', async () => {
		fakeToken = 'old-token';
		apiPost.mockResolvedValue({ token: 'new-token' });

		await rotateToken();

		expect(apiPost).toHaveBeenCalledWith('/api/v1/account/refresh');
		expect(fakeToken).toBe('new-token');
	});

	it('does nothing when there is no stored token', async () => {
		await rotateToken();

		expect(apiPost).not.toHaveBeenCalled();
	});

	it('swallows failures and leaves the existing token in place', async () => {
		fakeToken = 'old-token';
		apiPost.mockRejectedValue(new Error('network error'));

		await expect(rotateToken()).resolves.toBeUndefined();
		expect(fakeToken).toBe('old-token');
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

	it('discards the rotated token when a different user logged in mid-request', async () => {
		fakeToken = 'old-token';
		apiPost.mockImplementation(async () => {
			// A different session's token replaced this one while the refresh was in flight.
			fakeToken = 'other-login-token';
			return { token: 'new-token' };
		});

		await rotateToken();

		expect(fakeToken).toBe('other-login-token');
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
		vi.useFakeTimers();
		(globalThis as { window?: unknown }).window = new EventTarget();
		(globalThis as { document?: unknown }).document = new EventTarget() as Document;
	});

	afterEach(() => {
		resetAuthRotationForTesting();
		delete (globalThis as { window?: unknown }).window;
		delete (globalThis as { document?: unknown }).document;
		vi.useRealTimers();
	});

	function fireVisibilityChange(state: 'visible' | 'hidden'): void {
		Object.defineProperty(globalThis.document, 'visibilityState', {
			value: state,
			configurable: true
		});
		(globalThis.document as unknown as EventTarget).dispatchEvent(new Event('visibilitychange'));
	}

	it('attempts a rotation immediately when a token is stored', async () => {
		fakeToken = 'old-token';

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);

		expect(apiPost).toHaveBeenCalledTimes(1);
		expect(fakeToken).toBe('new-token');
	});

	it('does nothing on start when logged out', async () => {
		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);

		expect(apiPost).not.toHaveBeenCalled();
	});

	it('rotates again after the daily interval', async () => {
		fakeToken = 'old-token';

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPost).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
		expect(apiPost).toHaveBeenCalledTimes(2);
	});

	it('rotates on returning to the foreground, before the next interval tick', async () => {
		fakeToken = 'old-token';

		startAuthRotation();
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPost).toHaveBeenCalledTimes(1);

		fireVisibilityChange('visible');
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPost).toHaveBeenCalledTimes(2);
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

	it('resetAuthRotationForTesting is safe to call when nothing was started', () => {
		expect(() => resetAuthRotationForTesting()).not.toThrow();
	});
});

describe('startAuthRotation without a window (SSR/prerender)', () => {
	it('is a no-op', () => {
		expect(() => startAuthRotation()).not.toThrow();
	});
});
