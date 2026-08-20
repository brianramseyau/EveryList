import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/api/ping', () => ({ fetchPing: vi.fn() }));
vi.mock('$lib/offline/flush', () => ({ onFlushOutcome: vi.fn() }));

const { fetchPing } = await import('$lib/api/ping');
const { onFlushOutcome } = await import('$lib/offline/flush');
const { connectivity, startConnectivityMonitor, resetConnectivityForTesting } =
	await import('./connectivity.svelte');

type FlushListener = (outcome: { ok: boolean }) => void;

describe('connectivity', () => {
	let flushListener: FlushListener | null = null;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(fetchPing).mockResolvedValue(true);
		vi.mocked(onFlushOutcome).mockImplementation((listener) => {
			flushListener = listener as FlushListener;
			return vi.fn();
		});
		Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
	});

	afterEach(() => {
		resetConnectivityForTesting();
		flushListener = null;
		vi.useRealTimers();
		vi.resetAllMocks();
	});

	it('reports reachable after a successful ping', async () => {
		await connectivity.pingNow();

		expect(connectivity.serverUnavailable).toBe(false);
		expect(connectivity.lastSuccessfulSyncAt).not.toBeNull();
	});

	it('reports unavailable after a failed ping', async () => {
		vi.mocked(fetchPing).mockResolvedValue(false);

		await connectivity.pingNow();

		expect(connectivity.serverUnavailable).toBe(true);
	});

	it('reports unavailable without pinging while the browser is offline', async () => {
		Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });

		await connectivity.pingNow();

		expect(connectivity.serverUnavailable).toBe(true);
		expect(fetchPing).not.toHaveBeenCalled();
	});

	it('goes unavailable on the offline event', () => {
		startConnectivityMonitor();

		window.dispatchEvent(new Event('offline'));

		expect(connectivity.serverUnavailable).toBe(true);
	});

	it('re-pings on the online event', () => {
		startConnectivityMonitor();

		window.dispatchEvent(new Event('online'));

		expect(fetchPing).toHaveBeenCalledTimes(2);
	});

	it('mirrors flush outcomes, recording the sync time on success', () => {
		startConnectivityMonitor();

		flushListener!({ ok: false });
		expect(connectivity.serverUnavailable).toBe(true);

		flushListener!({ ok: true });
		expect(connectivity.serverUnavailable).toBe(false);
		expect(connectivity.lastSuccessfulSyncAt).not.toBeNull();
	});

	it('re-pings on an interval while mounted', async () => {
		startConnectivityMonitor();
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchPing).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(fetchPing).toHaveBeenCalledTimes(2);
	});

	it('is idempotent — a second start does not register more work', async () => {
		startConnectivityMonitor();
		startConnectivityMonitor();
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchPing).toHaveBeenCalledTimes(1);
	});
});
