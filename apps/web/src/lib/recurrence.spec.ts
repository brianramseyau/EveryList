import { describe, expect, it } from 'vitest';
import type { RecurrenceRule } from '@everylist/shared';
import {
	defaultRecurrenceRule,
	formatRecurrence,
	ordinal,
	ruleFromDto,
	snapDeadlineDate,
	weekdayOfDate,
	withUnit
} from './recurrence';

function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
	return {
		interval: 1,
		unit: 'day',
		weekdays: [],
		monthly: null,
		startDate: '2026-01-01',
		end: { type: 'never' },
		...overrides
	};
}

describe('weekdayOfDate', () => {
	it('is timezone independent', () => {
		expect(weekdayOfDate('2026-01-01')).toBe(4); // Thursday
	});
});

describe('ordinal', () => {
	it('handles the special teens and each suffix', () => {
		expect(ordinal(1)).toBe('1st');
		expect(ordinal(2)).toBe('2nd');
		expect(ordinal(3)).toBe('3rd');
		expect(ordinal(4)).toBe('4th');
		expect(ordinal(11)).toBe('11th');
		expect(ordinal(21)).toBe('21st');
	});
});

describe('defaultRecurrenceRule', () => {
	it('is weekly on the start weekday, forever', () => {
		expect(defaultRecurrenceRule('2026-01-01')).toEqual({
			interval: 1,
			unit: 'week',
			weekdays: [4],
			monthly: null,
			startDate: '2026-01-01',
			end: { type: 'never' }
		});
	});
});

describe('withUnit', () => {
	it('seeds the start weekday for week and clears unit-specific fields otherwise', () => {
		const monthly = rule({ unit: 'month', monthly: { kind: 'dayOfMonth', day: 5 } });
		expect(withUnit(monthly, 'week')).toMatchObject({ unit: 'week', weekdays: [4], monthly: null });
		const weekly = rule({ unit: 'week', weekdays: [1, 2] });
		expect(withUnit(weekly, 'year')).toMatchObject({ unit: 'year', weekdays: [], monthly: null });
		expect(withUnit(weekly, 'month')).toMatchObject({
			unit: 'month',
			weekdays: [],
			monthly: { kind: 'dayOfMonth', day: 1 }
		});
	});
});

describe('snapDeadlineDate', () => {
	it('moves a date onto the rule grid', () => {
		expect(snapDeadlineDate(rule({ unit: 'week', weekdays: [1] }), '2026-01-01')).toBe(
			'2026-01-05'
		);
	});
});

describe('formatRecurrence', () => {
	it('describes each unit', () => {
		expect(formatRecurrence(rule())).toBe('Every day');
		expect(formatRecurrence(rule({ interval: 3 }))).toBe('Every 3 days');
		expect(formatRecurrence(rule({ unit: 'year' }))).toBe('Every year');
	});

	it('lists weekdays in order, defaulting to the start weekday', () => {
		expect(formatRecurrence(rule({ unit: 'week', interval: 2, weekdays: [4, 1] }))).toBe(
			'Every 2 weeks on Mon, Thu'
		);
		expect(formatRecurrence(rule({ unit: 'week' }))).toBe('Every week on Thu');
	});

	it('lists a Sunday last, since weeks start on Monday', () => {
		expect(formatRecurrence(rule({ unit: 'week', weekdays: [0, 1, 6] }))).toBe(
			'Every week on Mon, Sat, Sun'
		);
	});

	it('describes month rules', () => {
		expect(formatRecurrence(rule({ unit: 'month' }))).toBe('Every month on the 1st');
		expect(
			formatRecurrence(rule({ unit: 'month', monthly: { kind: 'dayOfMonth', day: 21 } }))
		).toBe('Every month on the 21st');
		expect(
			formatRecurrence(
				rule({ unit: 'month', monthly: { kind: 'nthWeekday', nth: -1, weekday: 5 } })
			)
		).toBe('Every month on the last Friday');
	});

	it('appends the end', () => {
		expect(formatRecurrence(rule({ end: { type: 'after', count: 5 } }))).toBe('Every day, 5 times');
		expect(formatRecurrence(rule({ end: { type: 'after', count: 1 } }))).toBe('Every day, 1 time');
		expect(formatRecurrence(rule({ end: { type: 'on', date: '2027-03-09' } }), 'en-US')).toBe(
			'Every day, until Mar 9, 2027'
		);
	});
});

describe('ruleFromDto', () => {
	it('drops the series id and occurrence count', () => {
		expect(ruleFromDto({ ...rule({ unit: 'week', weekdays: [1] }), id: 9, occurrence: 4 })).toEqual(
			rule({ unit: 'week', weekdays: [1] })
		);
	});
});
