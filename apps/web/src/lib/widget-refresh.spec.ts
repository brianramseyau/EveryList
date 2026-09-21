import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
	Capacitor: { getPlatform: vi.fn(), registerPlugin: vi.fn() }
}));

const { Capacitor } = await import('@capacitor/core');
const getPlatform = vi.mocked(Capacitor.getPlatform);
const registerPlugin = vi.mocked(Capacitor.registerPlugin);
const { refreshWidget, resetWidgetRefreshForTesting, WIDGET_REFRESH_DEBOUNCE_MS } =
	await import('./widget-refresh');

describe('refreshWidget', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		resetWidgetRefreshForTesting();
		vi.useRealTimers();
		vi.clearAllMocks();
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
});
