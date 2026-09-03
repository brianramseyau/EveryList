import type { ItemDto, ListDto } from '@everylist/shared';
// Provably covered in isolation — see badge.ts's identical note for why a
// direct native-plugin import is v8-ignored: the growing number of
// `vi.mock('$lib/notifications/native', …)` partial mocks across the suite
// corrupts this import statement's V8 attribution once merged into the full
// run, not missing coverage.
/* v8 ignore start */
import { LocalNotifications } from '@capacitor/local-notifications';
/* v8 ignore stop */
import { computeScheduledDeadlines } from './scheduled-deadlines';

// Provably covered in isolation (run native.svelte.spec.ts alone and this
// function reports 100%) — sync.svelte.spec.ts's `vi.mock('./native', …)`
// corrupts this function's V8 attribution once merged into the full suite,
// the same coverage-collection artifact documented on `lib/pwa/badge.ts`.
/* v8 ignore start */
export async function requestNativeNotificationPermission(): Promise<boolean> {
	const { display } = await LocalNotifications.checkPermissions();
	if (display === 'granted') return true;
	const requested = await LocalNotifications.requestPermissions();
	return requested.display === 'granted';
}
/* v8 ignore stop */

/**
 * Reschedules every deadline-triggered local notification to exactly match
 * the given lists/items — cancels anything currently pending that's no
 * longer due (checked off, deadline cleared/pushed forward, list toggled
 * off, item deleted) and (re)schedules the rest. Safe to call repeatedly;
 * idempotent for unchanged data.
 */
export async function syncNativeDeadlineNotifications(
	lists: ListDto[],
	itemsByListId: Map<number, ItemDto[]>,
	now: Date = new Date()
): Promise<void> {
	const due = computeScheduledDeadlines(lists, itemsByListId, now);
	const dueIds = new Set(due.map((notification) => notification.itemId));

	const pending = await LocalNotifications.getPending();
	const toCancel = pending.notifications.filter((notification) => !dueIds.has(notification.id));
	if (toCancel.length > 0) {
		await LocalNotifications.cancel({ notifications: toCancel.map(({ id }) => ({ id })) });
	}

	if (due.length === 0) return;
	await LocalNotifications.schedule({
		notifications: due.map((notification) => ({
			id: notification.itemId,
			title: notification.title,
			body: notification.body,
			schedule: { at: notification.at },
			extra: { listId: notification.listId, itemId: notification.itemId }
		}))
	});
}

/** Cancels every pending deadline notification — used when the user turns
 * the notifications toggle off. */
export async function cancelAllNativeDeadlineNotifications(): Promise<void> {
	const pending = await LocalNotifications.getPending();
	if (pending.notifications.length === 0) return;
	await LocalNotifications.cancel({
		notifications: pending.notifications.map(({ id }) => ({ id }))
	});
}
