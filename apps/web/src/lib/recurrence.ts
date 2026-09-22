// Web-side helpers for item repeat rules (PLAN_30_PHASE_RECURRING_ITEMS.md). The date math itself
// (nextOccurrence & co.) lives in @everylist/shared so the API and the form agree; this file is
// only labels, defaults and the summary text.
import {
	occurrenceOnOrAfter,
	type RecurrenceDto,
	type RecurrenceRule,
	type RecurrenceUnit
} from '@everylist/shared';

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LONG = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
];

/** Weekday numbers (0 = Sunday) in display order: ISO weeks start on Monday. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** The "week of the month" choices, in the order Google Tasks lists them. */
export const NTH_OPTIONS: { value: 1 | 2 | 3 | 4 | -1; label: string }[] = [
	{ value: 1, label: 'First' },
	{ value: 2, label: 'Second' },
	{ value: 3, label: 'Third' },
	{ value: 4, label: 'Fourth' },
	{ value: -1, label: 'Last' }
];

const NTH_WORDS: Record<1 | 2 | 3 | 4 | -1, string> = {
	1: 'first',
	2: 'second',
	3: 'third',
	4: 'fourth',
	'-1': 'last'
};

/** 0 = Sunday .. 6 = Saturday for a 'YYYY-MM-DD' calendar date (no timezone involved). */
export function weekdayOfDate(date: string): number {
	return new Date(
		Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
	).getUTCDay();
}

/** 1 -> '1st', 2 -> '2nd', 3 -> '3rd', 21 -> '21st', 11 -> '11th'. */
export function ordinal(value: number): string {
	const suffixes: Record<string, string> = { one: 'st', two: 'nd', few: 'rd' };
	return `${value}${suffixes[new Intl.PluralRules('en-US', { type: 'ordinal' }).select(value)] ?? 'th'}`;
}

/** The editable rule inside a stored series (drops the server-owned id and occurrence count). */
export function ruleFromDto(dto: RecurrenceDto): RecurrenceRule {
	return {
		interval: dto.interval,
		unit: dto.unit,
		weekdays: dto.weekdays,
		monthly: dto.monthly,
		startDate: dto.startDate,
		end: dto.end
	};
}

/** The rule a fresh "Repeat" toggle starts from: weekly on the start date's weekday, forever. */
export function defaultRecurrenceRule(startDate: string): RecurrenceRule {
	return {
		interval: 1,
		unit: 'week',
		weekdays: [weekdayOfDate(startDate)],
		monthly: null,
		startDate,
		end: { type: 'never' }
	};
}

/** Switches a rule's unit, resetting the fields that only make sense on the old one. */
export function withUnit(rule: RecurrenceRule, unit: RecurrenceUnit): RecurrenceRule {
	return {
		...rule,
		unit,
		weekdays: unit === 'week' ? [weekdayOfDate(rule.startDate)] : [],
		// A monthly rule starts as an explicit "day N" (N = the anchor's day) so the form has a
		// concrete value to show and edit rather than an implicit default.
		monthly:
			unit === 'month' ? { kind: 'dayOfMonth', day: Number(rule.startDate.slice(8, 10)) } : null
	};
}

/** The deadline date an item gets when saved with this rule: its current date, snapped forward onto
 * the rule's grid (a weekly-on-Monday rule can't leave the item due on a Thursday). */
export function snapDeadlineDate(rule: RecurrenceRule, deadlineDate: string): string {
	return occurrenceOnOrAfter(rule, deadlineDate);
}

function formatDate(date: string, locale?: string): string {
	return new Intl.DateTimeFormat(locale, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${date}T00:00:00Z`));
}

/** 'Every 2 weeks on Mon, Thu', 'Every month on the last Friday, 5 times', … */
export function formatRecurrence(rule: RecurrenceRule, locale?: string): string {
	const unitLabel = rule.interval === 1 ? rule.unit : `${rule.interval} ${rule.unit}s`;
	let text = `Every ${unitLabel}`;

	if (rule.unit === 'week') {
		const weekdays = rule.weekdays.length > 0 ? rule.weekdays : [weekdayOfDate(rule.startDate)];
		text += ` on ${[...weekdays]
			.sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b))
			.map((weekday) => WEEKDAY_SHORT[weekday])
			.join(', ')}`;
	} else if (rule.unit === 'month') {
		const monthly = rule.monthly;
		if (monthly?.kind === 'nthWeekday') {
			text += ` on the ${NTH_WORDS[monthly.nth]} ${WEEKDAY_LONG[monthly.weekday]}`;
		} else {
			const day = monthly?.day ?? Number(rule.startDate.slice(8, 10));
			text += ` on the ${ordinal(day)}`;
		}
	}

	if (rule.end.type === 'on') text += `, until ${formatDate(rule.end.date, locale)}`;
	if (rule.end.type === 'after') {
		text += `, ${rule.end.count} ${rule.end.count === 1 ? 'time' : 'times'}`;
	}
	return text;
}
