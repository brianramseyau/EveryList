import type { ItemDto, ListDto } from '@everylist/shared';
import { hasTime, splitDeadline } from '$lib/deadline';

export interface ScheduledDeadlineNotification {
	/** Stable per-item id, reused as the platform notification id so a
	 * re-sync can diff cleanly against what's currently scheduled. */
	itemId: number;
	listId: number;
	title: string;
	body: string;
	/** When the OS should fire the notification — always in the future;
	 * already-due/overdue items are never (re)scheduled locally, matching
	 * the server's no-retroactive-storm rule for Web Push. */
	at: Date;
	/** The item's raw deadline string (as stored, not `at`'s computed trigger instant) — carried
	 * through into the native notification's `extra` payload so the Android background action
	 * receiver (native.ts's `syncNativeDeadlineNotifications`) can compute a snooze without a
	 * WebView/network round trip, the same way push-sw.js's `notificationclick` handler uses its
	 * own `data.deadline`. */
	deadline: string;
}

/** Longest a deadline notification's body (the item's notes) is shown before being
 * truncated with an ellipsis — a conservative cut well under any platform's own
 * notification-body limit, so the truncation is ours and consistent rather than an
 * OS-specific mid-word cutoff. */
const MAX_BODY_LENGTH = 150;

/** Truncates `notes` for use as a deadline notification's body, or '' when there are
 * none — an empty string collapses to no second line rather than a blank one. */
export function notificationBody(notes: string | null): string {
	if (!notes) return '';
	return notes.length > MAX_BODY_LENGTH ? `${notes.slice(0, MAX_BODY_LENGTH - 1)}…` : notes;
}

/** Local calendar-date deadline → 9am that day, since a date-only deadline
 * has no time component to schedule against. Mirrors `deadline.ts`'s naive
 * local-time handling — no timezone math. */
export function triggerDate(deadline: string): Date {
	if (hasTime(deadline)) {
		const { date, time } = splitDeadline(deadline);
		const [year, month, day] = date.split('-').map(Number);
		const [hours, minutes] = time.split(':').map(Number);
		return new Date(year, month - 1, day, hours, minutes);
	}
	const [year, month, day] = deadline.split('-').map(Number);
	return new Date(year, month - 1, day, 9, 0);
}

/**
 * Pure function computing which local notifications should be scheduled
 * right now, from already-fetched lists/items — shared by the Capacitor
 * (native) and Electron notification schedulers (PLAN_26). Both platforms
 * hold their own local clock, so — unlike the server's Web Push path — this
 * can schedule for the exact future instant, no grace-window/server-clock
 * approximation needed.
 */
export function computeScheduledDeadlines(
	lists: ListDto[],
	itemsByListId: Map<number, ItemDto[]>,
	now: Date = new Date()
): ScheduledDeadlineNotification[] {
	const notifications: ScheduledDeadlineNotification[] = [];

	for (const list of lists) {
		if (list.useDeadline !== true) continue;
		const items = itemsByListId.get(list.id) ?? [];

		for (const item of items) {
			if (!item.deadline || item.checked) continue;
			const at = triggerDate(item.deadline);
			if (at <= now) continue;

			notifications.push({
				itemId: item.id,
				listId: list.id,
				title: item.name,
				body: notificationBody(item.notes),
				at,
				deadline: item.deadline
			});
		}
	}

	return notifications;
}
