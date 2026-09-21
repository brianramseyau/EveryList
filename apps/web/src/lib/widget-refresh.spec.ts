import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
	Capacitor: { getPlatform: vi.fn(), registerPlugin: vi.fn() }
}));

const { Capacitor } = await import('@capacitor/core');
const getPlatform = vi.mocked(Capacitor.getPlatform);
const registerPlugin = vi.mocked(Capacitor.registerPlugin);
const { refreshWidget, resetWidgetRefreshForTesting, WIDGET_REFRESH_DEBOUNCE_MS } =
	await import('./widget-refresh');

// A minimal stand-in for `document` — this spec runs in the node project, where none exists.
const listeners = new Map<string, () => void>();
const fakeDocument = {
	visibilityState: 'visible',
	addEventListener: vi.fn((type: string, fn: () => void) => listeners.set(type, fn)),
	removeEventListener: vi.fn((type: string) => listeners.delete(type))
};

describe('refreshWidget', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		fakeDocument.visibilityState = 'visible';
		vi.stubGlobal('document', fakeDocument);
	});

	afterEach(() => {
		resetWidgetRefreshForTesting();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
		listeners.clear();
	});

	it('does nothing off Android (web, PWA, iOS)', () => {
		getPlatform.mockReturnValue('web');
		refreshWidget();
		vi.advanceTimersByTime(WIDGET_REFRESH_DEBOUNCE_MS * 2);
		expect(registerPlugin).not.toHaveBeenCalled();
	});

	it('calls the native plugin once after the debounce, however many writes came in', () => {
		getPlatform.mockReturnValue('android');
		const refresh = vi.fn().mockResolvedValue(undefined);
		registerPlugin.mockReturnValue({ refresh } as never);

		refreshWidget();
		vi.advanceTimersByTime(WIDGET_REFRESH_DEBOUNCE_MS - 1);
		refreshWidget();
		vi.advanceTimersByTime(WIDGET_REFRESH_DEBOUNCE_MS - 1);
		expect(refresh).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(registerPlugin).toHaveBeenCalledWith('EveryListWidget');
	});

	it('reuses the plugin handle across refreshes', () => {
		getPlatform.mockReturnValue('android');
		const refresh = vi.fn().mockResolvedValue(undefined);
		registerPlugin.mockReturnValue({ refresh } as never);

		refreshWidget();
		vi.advanceTimersByTime(WIDGET_REFRESH_DEBOUNCE_MS);
		refreshWidget();
		vi.advanceTimersByTime(WIDGET_REFRESH_DEBOUNCE_MS);
		expect(refresh).toHaveBeenCalledTimes(2);
		expect(registerPlugin).toHaveBeenCalledTimes(1);
	});

	it('swallows a failed refresh', async () => {
		getPlatform.mockReturnValue('android');
		const refresh = vi.fn().mockRejectedValue(new Error('not implemented'));
		registerPlugin.mockReturnValue({ refresh } as never);

		refreshWidget();
		vi.advanceTimersByTime(WIDGET_REFRESH_DEBOUNCE_MS);
		await Promise.resolve();
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	function setUpAndroid() {
		getPlatform.mockReturnValue('android');
		const refresh = vi.fn().mockResolvedValue(undefined);
		registerPlugin.mockReturnValue({ refresh } as never);
		return refresh;
	}

	it('sends a pending refresh right away when the app is hidden', () => {
		const refresh = setUpAndroid();
		refreshWidget();

		fakeDocument.visibilityState = 'hidden';
		listeners.get('visibilitychange')?.();
		expect(refresh).toHaveBeenCalledTimes(1);

		// The debounce timer was consumed by the flush — it must not fire a second call.
		vi.advanceTimersByTime(WIDGET_REFRESH_DEBOUNCE_MS * 2);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('sends immediately, with no debounce, when a write lands while already hidden', () => {
		const refresh = setUpAndroid();
		fakeDocument.visibilityState = 'hidden';

		refreshWidget();
		expect(refresh).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(WIDGET_REFRESH_DEBOUNCE_MS * 2);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('ignores visibility changes when nothing is pending or the app is visible', () => {
		const refresh = setUpAndroid();
		refreshWidget();

		listeners.get('visibilitychange')?.(); // visible, timer pending
		expect(refresh).not.toHaveBeenCalled();

		vi.advanceTimersByTime(WIDGET_REFRESH_DEBOUNCE_MS);
		expect(refresh).toHaveBeenCalledTimes(1);

		fakeDocument.visibilityState = 'hidden';
		listeners.get('visibilitychange')?.(); // hidden, nothing pending
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('registers the visibility listener only once', () => {
		setUpAndroid();
		refreshWidget();
		refreshWidget();
		expect(fakeDocument.addEventListener).toHaveBeenCalledTimes(1);
	});
});
