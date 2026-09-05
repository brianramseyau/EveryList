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
				title: 'Required by',
				body: item.name,
				at
			});
		}
	}

	return notifications;
}
