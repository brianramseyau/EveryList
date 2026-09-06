import type { ItemDto, ListDto } from '@everylist/shared';
// Provably covered in isolation — see badge.ts's identical note for why a
// direct native-plugin import is v8-ignored: the growing number of
// `vi.mock('$lib/notifications/native', …)` partial mocks across the suite
// corrupts this import statement's V8 attribution once merged into the full
// run, not missing coverage.
/* v8 ignore start */
import { LocalNotifications } from '@capacitor/local-notifications';
/* v8 ignore stop */
import { addHoursToDeadline } from '$lib/deadline';
import { fetchItems, updateItem } from '$lib/api/items';
import { computeScheduledDeadlines, triggerDate } from './scheduled-deadlines';

/** Tags every notification this module schedules, so cancel logic below only ever touches
 * its own notifications — not some future feature's unrelated `@capacitor/local-notifications`
 * entries that happen to land in the same pending set. */
const SOURCE = 'deadline';

/** Referenced by every deadline notification's `actionTypeId` — the "Complete"/"Snooze" buttons
 * in the notification's expanded actions area (iOS long-press, Android's chevron). */
const ACTION_TYPE_ID = 'deadline';
const COMPLETE_ACTION_ID = 'complete';
const SNOOZE_ACTION_ID = 'snooze';
/** Capacitor's built-in identifier for a plain tap on the notification body (as opposed to one
 * of the actions declared below) — not something this module defines itself. */
const TAP_ACTION_ID = 'tap';

function isOwnNotification(notification: { extra?: unknown }): boolean {
	const extra = notification.extra as { source?: string } | undefined;
	return extra?.source === SOURCE;
}

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
	const toCancel = pending.notifications.filter(
		(notification) => isOwnNotification(notification) && !dueIds.has(notification.id)
	);
	if (toCancel.length > 0) {
		await LocalNotifications.cancel({ notifications: toCancel.map(({ id }) => ({ id })) });
	}

	if (due.length === 0) return;
	// Android's plugin looks up this batch's `actionTypeId` synchronously while building each
	// notification and, with no try/catch around its scheduling loop, an unregistered type
	// throws and aborts the *entire* batch — not just one notification. registerActionTypes is
	// otherwise called once at app launch (+layout.svelte), but that call races this one on cold
	// start: the schedule call dispatched from the launch-time resync can reach the native side
	// before the registration call does, silently dropping every deadline notification until the
	// next resync. Awaiting it here — cheap and idempotent — makes every schedule call safe
	// regardless of what the caller already did.
	await registerNativeDeadlineActionTypes();
	await LocalNotifications.schedule({
		notifications: due.map((notification) => ({
			id: notification.itemId,
			title: notification.title,
			body: notification.body,
			schedule: { at: notification.at },
			actionTypeId: ACTION_TYPE_ID,
			extra: { listId: notification.listId, itemId: notification.itemId, source: SOURCE }
		}))
	});
}

/** Cancels every pending deadline notification (identified by the `source` tag
 * `syncNativeDeadlineNotifications` schedules with) — used when the user turns the
 * notifications toggle off. Leaves any other plugin consumer's notifications untouched. */
export async function cancelAllNativeDeadlineNotifications(): Promise<void> {
	const pending = await LocalNotifications.getPending();
	const ours = pending.notifications.filter(isOwnNotification);
	if (ours.length === 0) return;
	await LocalNotifications.cancel({ notifications: ours.map(({ id }) => ({ id })) });
}

/** Declares the "Complete"/"Snooze" buttons a deadline notification's expanded actions area
 * offers (iOS's `UNNotificationCategory`, Android's `NotificationCompat.Action`) — must run on
 * every app launch, not just once, since iOS discards the registration between sessions. Safe to
 * call before permission is granted or before any notification is scheduled.
 *
 * `foreground: false` on both actions keeps them handled entirely in the background (iOS's
 * `UNNotificationAction` launches the app to the foreground unless told otherwise) — the plain
 * tap-to-open action has no such flag and always opens the app, which is the behavior wanted for
 * it (see `listenForNativeDeadlineActions`'s `onTap`). */
export async function registerNativeDeadlineActionTypes(): Promise<void> {
	await LocalNotifications.registerActionTypes({
		types: [
			{
				id: ACTION_TYPE_ID,
				actions: [
					{ id: COMPLETE_ACTION_ID, title: 'Complete', foreground: false },
					{ id: SNOOZE_ACTION_ID, title: 'Snooze 1 hr', foreground: false }
				]
			}
		]
	});
}

/** Checks off the item and cancels its own pending notification (rather than a full resync —
 * this is the only notification whose fate `updateItem`'s `checked: true` affects). */
async function completeFromNotification(listId: number, itemId: number): Promise<void> {
	await updateItem(listId, itemId, { checked: true });
	await LocalNotifications.cancel({ notifications: [{ id: itemId }] });
}

/** Pushes the item's deadline forward an hour and reschedules its notification to match — a
 * single-item reschedule rather than a full resync, since every other item's due state is
 * unaffected by this one snooze. */
async function snoozeFromNotification(listId: number, itemId: number): Promise<void> {
	const items = await fetchItems(listId);
	const item = items.find((candidate) => candidate.id === itemId);
	if (!item?.deadline) return;

	const deadline = addHoursToDeadline(item.deadline, 1);
	await updateItem(listId, itemId, { deadline });
	await LocalNotifications.schedule({
		notifications: [
			{
				id: itemId,
				title: 'Required by',
				body: item.name,
				schedule: { at: triggerDate(deadline) },
				actionTypeId: ACTION_TYPE_ID,
				extra: { listId, itemId, source: SOURCE }
			}
		]
	});
}

/** Wires the "Complete"/"Snooze" notification actions to their effect, and a plain tap on the
 * notification body to `onTap`, so the caller can navigate to the specific list/item the
 * notification was about (the OS opens the app either way — this only decides where inside it
 * to go). Call once at app launch (native platforms only). Ignores notifications from some
 * other, unrelated `@capacitor/local-notifications` consumer (see `isOwnNotification`). */
export function listenForNativeDeadlineActions(
	onTap: (listId: number, itemId: number) => void
): ReturnType<typeof LocalNotifications.addListener> {
	return LocalNotifications.addListener('localNotificationActionPerformed', (performed) => {
		if (!isOwnNotification(performed.notification)) return;
		const extra = performed.notification.extra as { listId: number; itemId: number };

		// Fire-and-forget by necessity (this listener callback isn't awaited by the plugin), but
		// still caught: an uncaught rejection here (a network failure, `LocalNotifications.cancel`/
		// `schedule` throwing) would otherwise surface as nothing more than a silently no-op'd
		// action, with no trace of why.
		if (performed.actionId === COMPLETE_ACTION_ID) {
			void completeFromNotification(extra.listId, extra.itemId).catch((error: unknown) => {
				console.error('Failed to complete item from notification action', error);
			});
		} else if (performed.actionId === SNOOZE_ACTION_ID) {
			void snoozeFromNotification(extra.listId, extra.itemId).catch((error: unknown) => {
				console.error('Failed to snooze item from notification action', error);
			});
		} else if (performed.actionId === TAP_ACTION_ID) {
			onTap(extra.listId, extra.itemId);
		}
	});
}
