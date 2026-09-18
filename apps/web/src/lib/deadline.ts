// Per-item deadlines (PLAN_24_PHASE_ITEM_DEADLINES.md). A deadline is naive-
// local ISO 8601 — 'YYYY-MM-DD' (date only, due by end of that day) or
// 'YYYY-MM-DDTHH:mm' (minute precision, no seconds, no timezone). Everything
// here compares/formats strings by hand instead of letting the Date parser
// treat a bare date as UTC midnight, which would shift the day for any server
// west of UTC. `now` is injectable everywhere for fake-timer tests.

function pad(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

/** 'YYYY-MM-DD' for the given instant's *local* calendar day. */
export function todayLocalIso(now: Date = new Date()): string {
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 'YYYY-MM-DDTHH:mm' for the given instant's local clock, minute precision. */
export function formatLocalMinuteIso(instant: Date): string {
	return `${todayLocalIso(instant)}T${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
}

/** 'YYYY-MM-DDTHH:mm' for the given instant's local clock, minute precision. */
export function nowLocalMinuteIso(now: Date = new Date()): string {
	return formatLocalMinuteIso(now);
}

/** True when the deadline carries a time part (i.e. it's 'YYYY-MM-DDTHH:mm'). */
export function hasTime(deadline: string): boolean {
	return deadline.length > 10;
}

/**
 * Past-due check. Date-only deadlines are due by the *end* of their day, so
 * they only become overdue the next day; datetimes become overdue the minute
 * after their time passes.
 */
export function isOverdue(deadline: string, now: Date = new Date()): boolean {
	const reference = hasTime(deadline) ? nowLocalMinuteIso(now) : todayLocalIso(now);
	return deadline < reference;
}

/**
 * Due today and not yet past: date-only deadlines are "due today" for the
 * whole day; datetimes only until their time passes (after that they're
 * overdue, see isOverdue).
 */
export function isDueToday(deadline: string, now: Date = new Date()): boolean {
	if (deadline.slice(0, 10) !== todayLocalIso(now)) return false;
	return !hasTime(deadline) || !isOverdue(deadline, now);
}

/** Splits a deadline into its date and (possibly empty) 'HH:mm' time parts. */
export function splitDeadline(deadline: string): { date: string; time: string } {
	return { date: deadline.slice(0, 10), time: deadline.slice(11) };
}

/** '2:30 PM' (locale time style) for the deadline's time part, or '' when it has none. */
export function formatDeadlineTime(deadline: string, locale?: string): string {
	const { date, time } = splitDeadline(deadline);
	if (!time) return '';
	const [year, month, day] = date.split('-').map(Number);
	const [hours, minutes] = time.split(':').map(Number);
	return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
		new Date(year, month - 1, day, hours, minutes)
	);
}

/**
 * 'Sep 5' for a date-only deadline, 'Sep 5, 2:30 PM' (locale time style) when
 * a time is set. Built from date parts rather than `new Date(iso)` so the
 * formatted day can never drift across a timezone boundary.
 */
export function formatDeadline(deadline: string, locale?: string): string {
	const { date } = splitDeadline(deadline);
	const [year, month, day] = date.split('-').map(Number);
	const localDate = new Date(year, month - 1, day);
	const dateText = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
		localDate
	);
	const timeText = formatDeadlineTime(deadline, locale);
	return timeText ? `${dateText}, ${timeText}` : dateText;
}

/**
 * The reschedule overlay's "1 hour" shortcut — the given deadline's effective time (a date-only
 * deadline has no time of its own, so it's based off 9am, matching
 * `scheduled-deadlines.ts#triggerDate`'s local-notification trigger) plus `hours`, or `now` plus
 * `hours` if that's later. That fallback matters because a notification can sit unread for a
 * while before it's rescheduled: without it, "+1hr" off an already-passed deadline (or a
 * date-only one whose Web Push notification fires near midnight) would still land in the past,
 * so the item would immediately re-show as overdue instead of actually being deferred. Always
 * returns a datetime deadline, even from a date-only input, since this shortcut is only offered
 * when the deadline already has a time (see `RescheduleOverlay.svelte`).
 */
export function addHoursToDeadline(
	deadline: string,
	hours: number,
	now: Date = new Date()
): string {
	const { date, time } = splitDeadline(deadline);
	const [year, month, day] = date.split('-').map(Number);
	const [hour, minute] = hasTime(deadline) ? time.split(':').map(Number) : [9, 0];
	const at = new Date(year, month - 1, day, hour, minute);
	at.setHours(at.getHours() + hours);

	const earliest = new Date(now);
	earliest.setHours(earliest.getHours() + hours);

	return formatLocalMinuteIso(at > earliest ? at : earliest);
}

/** Applies a computed local `Date` back onto a deadline, keeping the original's time-of-day when
 * it had one and falling back to date-only otherwise — the shared tail end of the three
 * reschedule shortcuts below. A timed result is floored at `now`: "This weekend" computed on a
 * Saturday/Sunday targets *today*, so re-applying a deadline's already-passed time-of-day would
 * otherwise produce a result already in the past — the item would immediately re-show as overdue
 * instead of actually being deferred, the same failure mode `addHoursToDeadline` already guards
 * against. A date-only result needs no such floor: it's due by the end of that day regardless of
 * the current time, so today is never "in the past" for one. */
function withSameTimeOfDay(deadline: string, target: Date, now: Date): string {
	if (!hasTime(deadline)) return todayLocalIso(target);
	const { time } = splitDeadline(deadline);
	const [hour, minute] = time.split(':').map(Number);
	const at = new Date(target);
	at.setHours(hour, minute, 0, 0);
	return formatLocalMinuteIso(at > now ? at : now);
}

/**
 * The reschedule overlay's "Tomorrow" shortcut — tomorrow's calendar date relative to `now`,
 * keeping the deadline's time-of-day if it had one.
 */
export function tomorrowDeadline(deadline: string, now: Date = new Date()): string {
	const tomorrow = new Date(now);
	tomorrow.setDate(tomorrow.getDate() + 1);
	return withSameTimeOfDay(deadline, tomorrow, now);
}

/**
 * The reschedule overlay's "This weekend" shortcut — the coming Saturday, or today if today is
 * already Saturday or Sunday, keeping the deadline's time-of-day if it had one.
 */
export function thisWeekendDeadline(deadline: string, now: Date = new Date()): string {
	const dayOfWeek = now.getDay(); // 0 = Sunday .. 6 = Saturday
	const daysUntilSaturday = dayOfWeek === 0 || dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
	const target = new Date(now);
	target.setDate(target.getDate() + daysUntilSaturday);
	return withSameTimeOfDay(deadline, target, now);
}

/**
 * The reschedule overlay's "Next week" shortcut — next Monday, always a future date even if
 * today is already Monday, keeping the deadline's time-of-day if it had one.
 */
export function nextWeekDeadline(deadline: string, now: Date = new Date()): string {
	const dayOfWeek = now.getDay(); // 0 = Sunday .. 6 = Saturday
	const daysUntilNextMonday = (8 - dayOfWeek) % 7 || 7;
	const target = new Date(now);
	target.setDate(target.getDate() + daysUntilNextMonday);
	return withSameTimeOfDay(deadline, target, now);
}

export interface DeadlineChip {
	label: string;
	/** Past the deadline — renders red. */
	overdue: boolean;
	/** Due today (date-only, or a datetime later today) — renders amber. */
	dueToday: boolean;
}

/**
 * The list-row chip's text + state for a deadline, per PLAN_24: red
 * `Overdue (Sep 5, 2:30 PM)`, amber `Today[, 2:30 PM]`, neutral
 * `Required by Sep 5[, 2:30 PM]`.
 */
export function deadlineChip(
	deadline: string,
	now: Date = new Date(),
	locale?: string
): DeadlineChip {
	if (isOverdue(deadline, now)) {
		return {
			label: `Overdue (${formatDeadline(deadline, locale)})`,
			overdue: true,
			dueToday: false
		};
	}
	if (isDueToday(deadline, now)) {
		const time = formatDeadlineTime(deadline, locale);
		return { label: time ? `Today, ${time}` : 'Today', overdue: false, dueToday: true };
	}
	return {
		label: `Required by ${formatDeadline(deadline, locale)}`,
		overdue: false,
		dueToday: false
	};
}
