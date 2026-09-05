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
 * The notification "Snooze" action's target deadline — the given deadline's effective time (a
 * date-only deadline has no time of its own, so it's based off 9am, matching
 * `scheduled-deadlines.ts#triggerDate`'s local-notification trigger) plus `hours`. Always returns
 * a datetime deadline, even from a date-only input, since snoozing inherently pins it to a time.
 */
export function addHoursToDeadline(deadline: string, hours: number): string {
	const { date, time } = splitDeadline(deadline);
	const [year, month, day] = date.split('-').map(Number);
	const [hour, minute] = hasTime(deadline) ? time.split(':').map(Number) : [9, 0];
	const at = new Date(year, month - 1, day, hour, minute);
	at.setHours(at.getHours() + hours);
	return formatLocalMinuteIso(at);
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
