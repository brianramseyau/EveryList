import type { ItemDto, ListDto } from '@everylist/shared';
import {
	computeScheduledDeadlines,
	type ScheduledDeadlineNotification
} from './scheduled-deadlines';

// Electron has no viable Web Push path without external FCM wiring (see
// PLAN_26_PHASE_DEADLINE_NOTIFICATIONS.md), so the desktop app schedules its
// own in-renderer timers instead — reliable as long as the process stays
// alive, which `apps/desktop/main.cjs`'s tray/background-run mode (enabled
// alongside this feature) is responsible for.
const scheduledTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

// `setTimeout`'s delay is a signed 32-bit int — anything past ~24.8 days
// gets silently clamped to fire immediately instead of at the real delay.
// A deadline further out than that re-arms itself in `MAX_DELAY_MS`-sized
// steps, recomputing the remaining delay each time, until it actually
// reaches the due instant.
const MAX_DELAY_MS = 2 ** 31 - 1;

function armTimeout(notification: ScheduledDeadlineNotification): void {
	const remaining = notification.at.getTime() - Date.now();
	const delay = Math.min(remaining, MAX_DELAY_MS);

	const handle = setTimeout(() => {
		if (remaining > MAX_DELAY_MS) {
			armTimeout(notification);
			return;
		}
		scheduledTimeouts.delete(notification.itemId);
		new Notification(notification.title, { body: notification.body });
	}, delay);
	scheduledTimeouts.set(notification.itemId, handle);
}

export async function requestElectronNotificationPermission(): Promise<boolean> {
	if (typeof Notification === 'undefined') return false;
	if (Notification.permission === 'granted') return true;
	const permission = await Notification.requestPermission();
	return permission === 'granted';
}

/**
 * Reschedules every deadline timer to exactly match the given lists/items —
 * clears anything no longer due and (re)schedules the rest. Safe to call
 * repeatedly; idempotent for unchanged data. Mirrors
 * `native.ts#syncNativeDeadlineNotifications`'s diffing shape, but manages
 * its own `setTimeout` handles instead of a plugin's OS-level schedule.
 */
export function syncElectronDeadlineNotifications(
	lists: ListDto[],
	itemsByListId: Map<number, ItemDto[]>,
	now: Date = new Date()
): void {
	const due = computeScheduledDeadlines(lists, itemsByListId, now);
	const dueIds = new Set(due.map((notification) => notification.itemId));

	for (const [itemId, handle] of scheduledTimeouts) {
		if (!dueIds.has(itemId)) {
			clearTimeout(handle);
			scheduledTimeouts.delete(itemId);
		}
	}

	for (const notification of due) {
		const existing = scheduledTimeouts.get(notification.itemId);
		if (existing) clearTimeout(existing);
		armTimeout(notification);
	}
}

/** Clears every pending deadline timer — used when the user turns the
 * notifications toggle off. */
export function cancelAllElectronDeadlineNotifications(): void {
	for (const handle of scheduledTimeouts.values()) clearTimeout(handle);
	scheduledTimeouts.clear();
}
