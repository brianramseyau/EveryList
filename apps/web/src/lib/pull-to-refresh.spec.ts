import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: vi.fn(), registerPlugin: vi.fn() }
}));

const { Capacitor } = await import('@capacitor/core');
const isNativePlatform = vi.mocked(Capacitor.isNativePlatform);
const registerPlugin = vi.mocked(Capacitor.registerPlugin);
const { suppressPullToRefresh } = await import('./pull-to-refresh');

function mockNativeClient(setEnabled: ReturnType<typeof vi.fn>) {
	const client = { setEnabled };
	vi.mocked(registerPlugin).mockReturnValue(client as never);
	return client;
}

describe('pull-to-refresh', () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('is a no-op on the web/PWA build', () => {
		isNativePlatform.mockReturnValue(false);
		const release = suppressPullToRefresh();
		expect(registerPlugin).not.toHaveBeenCalled();
		release();
	});

	it('disables native pull-to-refresh while suppressed and re-enables on release', async () => {
		isNativePlatform.mockReturnValue(true);
		const setEnabled = vi.fn().mockResolvedValue(undefined);
		mockNativeClient(setEnabled);

		const release = suppressPullToRefresh();
		expect(setEnabled).toHaveBeenCalledExactlyOnceWith({ enabled: false });

		release();
		await vi.waitFor(() => expect(setEnabled).toHaveBeenCalledWith({ enabled: true }));
		expect(setEnabled).toHaveBeenCalledTimes(2);
	});

	it('reference-counts overlapping suppressions — refresh only comes back once every caller releases', () => {
		isNativePlatform.mockReturnValue(true);
		const setEnabled = vi.fn().mockResolvedValue(undefined);
		mockNativeClient(setEnabled);

		const releaseA = suppressPullToRefresh();
		const releaseB = suppressPullToRefresh();
		expect(setEnabled).toHaveBeenCalledExactlyOnceWith({ enabled: false });

		releaseA();
		expect(setEnabled).toHaveBeenCalledExactlyOnceWith({ enabled: false });

		releaseB();
		expect(setEnabled).toHaveBeenCalledWith({ enabled: true });
	});

	it('releasing more than once is a no-op', () => {
		isNativePlatform.mockReturnValue(true);
		const setEnabled = vi.fn().mockResolvedValue(undefined);
		mockNativeClient(setEnabled);

		const release = suppressPullToRefresh();
		release();
		release();
		expect(setEnabled).toHaveBeenCalledTimes(2);
	});
});
