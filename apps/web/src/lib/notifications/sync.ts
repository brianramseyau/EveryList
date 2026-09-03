import { Capacitor } from '@capacitor/core';
import type { ItemDto } from '@everylist/shared';
import { fetchLists } from '$lib/api/lists';
import { fetchItems } from '$lib/api/items';
import { isDesktop } from '$lib/platform/desktop';
import {
	cancelAllNativeDeadlineNotifications,
	requestNativeNotificationPermission,
	syncNativeDeadlineNotifications
} from './native';
import {
	cancelAllElectronDeadlineNotifications,
	requestElectronNotificationPermission,
	syncElectronDeadlineNotifications
} from './electron';
import { isPushSupported, requestPermissionAndSubscribe, unsubscribe } from '$lib/pwa/push';

const PREFERENCE_KEY = 'everylist:deadline-notifications-enabled';

function hasStorage(): boolean {
	return typeof window !== 'undefined';
}

export type NotificationPlatform = 'native' | 'electron' | 'web' | 'unsupported';

export function notificationPlatform(): NotificationPlatform {
	if (Capacitor.isNativePlatform()) return 'native';
	if (isDesktop()) return 'electron';
	if (isPushSupported()) return 'web';
	return 'unsupported';
}

/** Fetches every deadline-enabled list's items and reschedules native/Electron
 * local notifications to match — a no-op on the web platform, which relies on
 * server-driven Web Push instead. Safe to call repeatedly (app resume, after
 * a sync, after toggling a list's useDeadline). */
export async function resyncDeadlineNotifications(now: Date = new Date()): Promise<void> {
	const platform = notificationPlatform();
	if (platform !== 'native' && platform !== 'electron') return;

	const lists = await fetchLists();
	const deadlineLists = lists.filter((list) => list.useDeadline === true);

	const itemsByListId = new Map<number, ItemDto[]>();
	for (const list of deadlineLists) {
		itemsByListId.set(list.id, await fetchItems(list.id));
	}

	if (platform === 'native') {
		await syncNativeDeadlineNotifications(deadlineLists, itemsByListId, now);
	} else {
		syncElectronDeadlineNotifications(deadlineLists, itemsByListId, now);
	}
}

/**
 * Requests platform permission and, for native/Electron, does an initial
 * schedule sync; for web, subscribes to Web Push. Returns whether it ended
 * up enabled — `false` both when permission is denied and when an
 * otherwise-granted attempt fails partway (network error fetching
 * lists/items, a plugin call rejecting, etc.), so a caller never has to
 * catch this itself. The preference is only persisted once the platform's
 * mechanism is actually confirmed working — persisting it first (before the
 * resync/subscribe settles) would leave the toggle showing "on" with
 * nothing actually scheduled if that step then failed.
 */
export async function enableDeadlineNotifications(): Promise<boolean> {
	const platform = notificationPlatform();

	try {
		if (platform === 'native') {
			const granted = await requestNativeNotificationPermission();
			if (!granted) return false;
			await resyncDeadlineNotifications();
			setDeadlineNotificationsPreference(true);
			return true;
		}

		if (platform === 'electron') {
			const granted = await requestElectronNotificationPermission();
			if (!granted) return false;
			await window.everylistDesktop?.setBackgroundRun(true);
			await resyncDeadlineNotifications();
			setDeadlineNotificationsPreference(true);
			return true;
		}

		if (platform !== 'web') return false;
		const subscribed = await requestPermissionAndSubscribe();
		if (subscribed) setDeadlineNotificationsPreference(true);
		return subscribed;
	} catch {
		// A network failure fetching lists/items (native/Electron) or subscribing (web) — the
		// preference is never persisted above this point, so the toggle correctly falls back
		// to "off" rather than claiming success with nothing actually scheduled.
		return false;
	}
}

export async function disableDeadlineNotifications(): Promise<void> {
	const platform = notificationPlatform();

	if (platform === 'native') {
		await cancelAllNativeDeadlineNotifications();
	} else if (platform === 'electron') {
		cancelAllElectronDeadlineNotifications();
		await window.everylistDesktop?.setBackgroundRun(false);
	} else if (platform === 'web') {
		await unsubscribe();
	}

	setDeadlineNotificationsPreference(false);
}

/** The Settings toggle's persisted on/off state — same local-preference
 * pattern as `shake.ts`'s `getShakeToUndoPreference`, since native/Electron
 * have no cheap synchronous "is enabled" signal of their own (it'd mean an
 * async plugin/permission call on every render). */
export function getDeadlineNotificationsPreference(): boolean {
	if (!hasStorage()) return false;
	return window.localStorage.getItem(PREFERENCE_KEY) === 'on';
}

function setDeadlineNotificationsPreference(enabled: boolean): void {
	if (!hasStorage()) return;
	window.localStorage.setItem(PREFERENCE_KEY, enabled ? 'on' : 'off');
}
