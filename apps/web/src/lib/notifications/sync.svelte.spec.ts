import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }));
vi.mock('$lib/platform/desktop', () => ({ isDesktop: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchLists: vi.fn() }));
vi.mock('$lib/api/items', () => ({ fetchItems: vi.fn() }));
vi.mock('./native', () => ({
	requestNativeNotificationPermission: vi.fn(),
	syncNativeDeadlineNotifications: vi.fn(),
	cancelAllNativeDeadlineNotifications: vi.fn()
}));
vi.mock('./electron', () => ({
	requestElectronNotificationPermission: vi.fn(),
	syncElectronDeadlineNotifications: vi.fn(),
	cancelAllElectronDeadlineNotifications: vi.fn()
}));
vi.mock('$lib/pwa/push', () => ({
	isPushSupported: vi.fn(),
	requestPermissionAndSubscribe: vi.fn(),
	unsubscribe: vi.fn()
}));

const { Capacitor } = await import('@capacitor/core');
const { isDesktop } = await import('$lib/platform/desktop');
const { fetchLists } = await import('$lib/api/lists');
const { fetchItems } = await import('$lib/api/items');
const native = await import('./native');
const electron = await import('./electron');
const push = await import('$lib/pwa/push');
const {
	notificationPlatform,
	resyncDeadlineNotifications,
	enableDeadlineNotifications,
	disableDeadlineNotifications,
	getDeadlineNotificationsPreference
} = await import('./sync');

function reset() {
	vi.clearAllMocks();
	vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
	vi.mocked(isDesktop).mockReturnValue(false);
	vi.mocked(push.isPushSupported).mockReturnValue(false);
	window.localStorage.removeItem('everylist:deadline-notifications-enabled');
	Reflect.deleteProperty(window, 'everylistDesktop');
}

afterEach(reset);
reset();

describe('notificationPlatform', () => {
	it('prefers native over everything else', () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		vi.mocked(isDesktop).mockReturnValue(true);
		expect(notificationPlatform()).toBe('native');
	});

	it('is electron when desktop and not native', () => {
		vi.mocked(isDesktop).mockReturnValue(true);
		expect(notificationPlatform()).toBe('electron');
	});

	it('is web when push is supported and neither native nor desktop', () => {
		vi.mocked(push.isPushSupported).mockReturnValue(true);
		expect(notificationPlatform()).toBe('web');
	});

	it('is unsupported otherwise', () => {
		expect(notificationPlatform()).toBe('unsupported');
	});
});

describe('resyncDeadlineNotifications', () => {
	it('is a no-op on web/unsupported', async () => {
		await resyncDeadlineNotifications();
		expect(fetchLists).not.toHaveBeenCalled();
	});

	it("fetches deadline-enabled lists' items and syncs native", async () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		vi.mocked(fetchLists).mockResolvedValue([
			{ id: 1, useDeadline: true },
			{ id: 2, useDeadline: false }
		] as never);
		vi.mocked(fetchItems).mockResolvedValue([{ id: 10 }] as never);

		const now = new Date(2026, 8, 5);
		await resyncDeadlineNotifications(now);

		expect(fetchItems).toHaveBeenCalledWith(1);
		expect(fetchItems).not.toHaveBeenCalledWith(2);
		expect(native.syncNativeDeadlineNotifications).toHaveBeenCalledWith(
			[{ id: 1, useDeadline: true }],
			new Map([[1, [{ id: 10 }]]]),
			now
		);
	});

	it('syncs electron instead of native when on desktop', async () => {
		vi.mocked(isDesktop).mockReturnValue(true);
		vi.mocked(fetchLists).mockResolvedValue([{ id: 1, useDeadline: true }] as never);
		vi.mocked(fetchItems).mockResolvedValue([] as never);

		await resyncDeadlineNotifications();

		expect(electron.syncElectronDeadlineNotifications).toHaveBeenCalled();
		expect(native.syncNativeDeadlineNotifications).not.toHaveBeenCalled();
	});
});

describe('enableDeadlineNotifications', () => {
	it('native: requests permission, syncs, and persists the preference', async () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		vi.mocked(native.requestNativeNotificationPermission).mockResolvedValue(true);
		vi.mocked(fetchLists).mockResolvedValue([]);

		expect(await enableDeadlineNotifications()).toBe(true);
		expect(getDeadlineNotificationsPreference()).toBe(true);
	});

	it('native: false and no preference change when permission is denied', async () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		vi.mocked(native.requestNativeNotificationPermission).mockResolvedValue(false);

		expect(await enableDeadlineNotifications()).toBe(false);
		expect(getDeadlineNotificationsPreference()).toBe(false);
	});

	it('electron: requests permission, syncs, persists the preference, and enables tray background-run', async () => {
		vi.mocked(isDesktop).mockReturnValue(true);
		vi.mocked(electron.requestElectronNotificationPermission).mockResolvedValue(true);
		vi.mocked(fetchLists).mockResolvedValue([]);
		const setBackgroundRun = vi.fn().mockResolvedValue(undefined);
		window.everylistDesktop = {
			version: '1.0.0',
			platform: 'darwin',
			checkForUpdate: vi.fn(),
			setBackgroundRun
		};

		expect(await enableDeadlineNotifications()).toBe(true);
		expect(getDeadlineNotificationsPreference()).toBe(true);
		expect(setBackgroundRun).toHaveBeenCalledWith(true);
	});

	it('electron: does not throw when the desktop bridge is absent', async () => {
		vi.mocked(isDesktop).mockReturnValue(true);
		vi.mocked(electron.requestElectronNotificationPermission).mockResolvedValue(true);
		vi.mocked(fetchLists).mockResolvedValue([]);

		expect(await enableDeadlineNotifications()).toBe(true);
	});

	it('electron: false when permission is denied', async () => {
		vi.mocked(isDesktop).mockReturnValue(true);
		vi.mocked(electron.requestElectronNotificationPermission).mockResolvedValue(false);

		expect(await enableDeadlineNotifications()).toBe(false);
	});

	it('web: subscribes to push and persists the preference on success', async () => {
		vi.mocked(push.isPushSupported).mockReturnValue(true);
		vi.mocked(push.requestPermissionAndSubscribe).mockResolvedValue(true);

		expect(await enableDeadlineNotifications()).toBe(true);
		expect(getDeadlineNotificationsPreference()).toBe(true);
	});

	it('web: does not persist the preference when subscribe fails', async () => {
		vi.mocked(push.isPushSupported).mockReturnValue(true);
		vi.mocked(push.requestPermissionAndSubscribe).mockResolvedValue(false);

		expect(await enableDeadlineNotifications()).toBe(false);
		expect(getDeadlineNotificationsPreference()).toBe(false);
	});

	it('unsupported: false', async () => {
		expect(await enableDeadlineNotifications()).toBe(false);
	});
});

describe('disableDeadlineNotifications', () => {
	it('native: cancels pending notifications and clears the preference', async () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		window.localStorage.setItem('everylist:deadline-notifications-enabled', 'on');

		await disableDeadlineNotifications();

		expect(native.cancelAllNativeDeadlineNotifications).toHaveBeenCalled();
		expect(getDeadlineNotificationsPreference()).toBe(false);
	});

	it('electron: clears timers, the preference, and disables tray background-run', async () => {
		vi.mocked(isDesktop).mockReturnValue(true);
		const setBackgroundRun = vi.fn().mockResolvedValue(undefined);
		window.everylistDesktop = {
			version: '1.0.0',
			platform: 'darwin',
			checkForUpdate: vi.fn(),
			setBackgroundRun
		};

		await disableDeadlineNotifications();

		expect(electron.cancelAllElectronDeadlineNotifications).toHaveBeenCalled();
		expect(setBackgroundRun).toHaveBeenCalledWith(false);
	});

	it('web: unsubscribes and clears the preference', async () => {
		vi.mocked(push.isPushSupported).mockReturnValue(true);

		await disableDeadlineNotifications();

		expect(push.unsubscribe).toHaveBeenCalled();
	});

	it('unsupported: just clears the preference, no platform call', async () => {
		window.localStorage.setItem('everylist:deadline-notifications-enabled', 'on');

		await disableDeadlineNotifications();

		expect(native.cancelAllNativeDeadlineNotifications).not.toHaveBeenCalled();
		expect(electron.cancelAllElectronDeadlineNotifications).not.toHaveBeenCalled();
		expect(push.unsubscribe).not.toHaveBeenCalled();
		expect(getDeadlineNotificationsPreference()).toBe(false);
	});
});

describe('getDeadlineNotificationsPreference', () => {
	it('defaults to false', () => {
		expect(getDeadlineNotificationsPreference()).toBe(false);
	});
});
