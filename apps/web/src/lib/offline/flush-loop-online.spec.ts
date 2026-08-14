import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `startFlushLoop`'s own logic (scheduling, backoff, the online listener) is decoupled here from
// real Dexie/IndexedDB entirely — `./db` and `./sync-queue` are mocked so the queue is just
// whatever array these tests hand back. That keeps fake timers well-behaved: mixing
// `vi.useFakeTimers()` with fake-indexeddb's own internal setTimeout-based request queue (used by
// real Dexie operations) made an earlier version of this file hang indefinitely, since the fake
// clock froze the polyfill's own scheduling along with the test's.
vi.mock('./db', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('./sync-queue', () => ({
	pendingMutations: vi.fn(),
	enqueueMutation: vi.fn(),
	dequeueMutation: vi.fn(),
	updateMutation: vi.fn()
}));
vi.mock('$lib/api/client', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/api/client')>();
	return { ...actual, apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() };
});

const { apiPatch } = await import('$lib/api/client');
const { pendingMutations, dequeueMutation } = await import('./sync-queue');
const { startFlushLoop, resetFlushLoopForTesting } = await import('./flush');

const MUTATION = {
	id: 1,
	entityType: 'item' as const,
	op: 'update' as const,
	targetId: 1,
	expectedVersion: 1,
	payload: {},
	url: '/api/v1/x',
	status: 'pending' as const,
	attempts: 0,
	createdAt: 0
};

function setOnline(online: boolean) {
	Object.defineProperty(globalThis.navigator, 'onLine', { value: online, configurable: true });
}

function fakeServiceWorker(registerImpl?: () => Promise<void>) {
	Object.defineProperty(globalThis.navigator, 'serviceWorker', {
		value: {
			ready: Promise.resolve({ sync: registerImpl ? { register: registerImpl } : undefined })
		},
		configurable: true
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	// Deterministic backoff delay — jitter would otherwise make the exact
	// `advanceTimersByTimeAsync` values below flaky.
	vi.spyOn(Math, 'random').mockReturnValue(0);
	(globalThis as { window?: unknown }).window = new EventTarget();
	setOnline(true);
	fakeServiceWorker(async () => {});
	vi.mocked(dequeueMutation).mockResolvedValue(undefined);
});

afterEach(() => {
	resetFlushLoopForTesting();
	delete (globalThis as { window?: unknown }).window;
	vi.useRealTimers();
	vi.resetAllMocks();
});

describe('startFlushLoop with a window', () => {
	it('does nothing when the queue is empty', async () => {
		vi.mocked(pendingMutations).mockResolvedValue([]);

		startFlushLoop();
		await vi.advanceTimersByTimeAsync(0);

		expect(apiPatch).not.toHaveBeenCalled();
	});

	it('is idempotent — a second call does not register a second online listener', async () => {
		vi.mocked(pendingMutations).mockResolvedValue([]);
		const addSpy = vi.spyOn(window, 'addEventListener');

		startFlushLoop();
		startFlushLoop();
		await vi.advanceTimersByTimeAsync(0);

		expect(addSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1);
	});

	it('skips the immediate attempt while offline', async () => {
		setOnline(false);
		vi.mocked(pendingMutations).mockResolvedValue([MUTATION]);

		startFlushLoop();
		await vi.advanceTimersByTimeAsync(0);

		expect(apiPatch).not.toHaveBeenCalled();
	});

	it('drains a pending mutation on start and does not schedule a retry once empty', async () => {
		vi.mocked(apiPatch).mockResolvedValue({ id: 1 });
		// attemptFlush reads pendingMutations three times per cycle: the "before" check, once
		// more inside flushQueue's own drain loop, then the "after" check.
		vi.mocked(pendingMutations)
			.mockResolvedValueOnce([MUTATION])
			.mockResolvedValueOnce([MUTATION])
			.mockResolvedValue([]);

		startFlushLoop();
		await vi.advanceTimersByTimeAsync(0);

		expect(apiPatch).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(apiPatch).toHaveBeenCalledTimes(1);
	});

	it('retries with backoff while a network error keeps the queue non-empty', async () => {
		vi.mocked(apiPatch).mockRejectedValue(new TypeError('network down'));
		vi.mocked(pendingMutations).mockResolvedValue([MUTATION]);

		startFlushLoop();
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPatch).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(2000);
		expect(apiPatch).toHaveBeenCalledTimes(2);
	});

	it('does not schedule a second retry timer while one is already pending', async () => {
		vi.mocked(apiPatch).mockRejectedValue(new TypeError('network down'));
		vi.mocked(pendingMutations).mockResolvedValue([MUTATION]);
		const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

		startFlushLoop();
		await vi.advanceTimersByTimeAsync(0);
		expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

		// Fires a second concurrent attemptFlush cycle before the first retry timer
		// elapses — its own scheduleRetry() call should see one already pending.
		window.dispatchEvent(new Event('online'));
		await vi.advanceTimersByTimeAsync(0);

		expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
	});

	it('resets backoff and re-attempts when the browser comes back online', async () => {
		vi.mocked(apiPatch).mockResolvedValue({ id: 1 });
		const mutation2 = { ...MUTATION, id: 2, targetId: 2 };
		vi.mocked(pendingMutations)
			.mockResolvedValueOnce([MUTATION])
			.mockResolvedValueOnce([MUTATION])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([mutation2])
			.mockResolvedValueOnce([mutation2])
			.mockResolvedValue([]);

		startFlushLoop();
		await vi.advanceTimersByTimeAsync(0);
		expect(apiPatch).toHaveBeenCalledTimes(1);

		window.dispatchEvent(new Event('online'));
		await vi.advanceTimersByTimeAsync(0);

		expect(apiPatch).toHaveBeenCalledTimes(2);
	});

	it('registers a Background Sync request when the service worker supports it', async () => {
		vi.mocked(pendingMutations).mockResolvedValue([]);
		const register = vi.fn().mockResolvedValue(undefined);
		fakeServiceWorker(register);

		startFlushLoop();
		await vi.advanceTimersByTimeAsync(0);

		expect(register).toHaveBeenCalledWith('everylist-flush');
	});

	it('degrades silently when Background Sync registration is unsupported or rejects', async () => {
		vi.mocked(pendingMutations).mockResolvedValue([]);
		Object.defineProperty(globalThis.navigator, 'serviceWorker', {
			value: { ready: Promise.reject(new Error('no service worker')) },
			configurable: true
		});

		expect(() => startFlushLoop()).not.toThrow();
		await vi.advanceTimersByTimeAsync(0);
	});
});
