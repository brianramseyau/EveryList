import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	addHoursToDeadline,
	deadlineChip,
	formatDeadline,
	formatDeadlineTime,
	hasTime,
	isDueToday,
	isOverdue,
	nowLocalMinuteIso,
	splitDeadline,
	todayLocalIso
} from './deadline';

/** A fixed local instant: 2026-09-05 15:00 local time. */
const NOW = new Date(2026, 8, 5, 15, 0, 0);

afterEach(() => {
	vi.useRealTimers();
});

describe('todayLocalIso / nowLocalMinuteIso', () => {
	it('builds the local calendar day, not a UTC-shifted one', () => {
		// 23:30 local on the 5th is already the 6th in UTC — the local parts win.
		expect(todayLocalIso(new Date(2026, 8, 5, 23, 30))).toBe('2026-09-05');
		expect(nowLocalMinuteIso(new Date(2026, 8, 5, 23, 30))).toBe('2026-09-05T23:30');
	});

	it('zero-pads single-digit months, days, hours and minutes', () => {
		expect(nowLocalMinuteIso(new Date(2026, 0, 3, 7, 5))).toBe('2026-01-03T07:05');
	});
});

describe('addHoursToDeadline', () => {
	it('adds hours to a datetime deadline', () => {
		expect(addHoursToDeadline('2026-09-05T14:30', 1)).toBe('2026-09-05T15:30');
	});

	it('rolls over into the next day/month/year', () => {
		expect(addHoursToDeadline('2026-09-05T23:30', 1)).toBe('2026-09-06T00:30');
		expect(addHoursToDeadline('2026-12-31T23:30', 1)).toBe('2027-01-01T00:30');
	});

	it('bases a date-only deadline off 9am, matching the notification trigger time', () => {
		expect(addHoursToDeadline('2026-09-05', 1)).toBe('2026-09-05T10:00');
	});
});

describe('hasTime / splitDeadline', () => {
	it('distinguishes the two accepted shapes', () => {
		expect(hasTime('2026-09-05')).toBe(false);
		expect(hasTime('2026-09-05T14:30')).toBe(true);
		expect(splitDeadline('2026-09-05T14:30')).toEqual({ date: '2026-09-05', time: '14:30' });
		expect(splitDeadline('2026-09-05')).toEqual({ date: '2026-09-05', time: '' });
	});
});

describe('isOverdue', () => {
	it('treats a date-only deadline as due through the end of its day', () => {
		expect(isOverdue('2026-09-05', NOW)).toBe(false);
		expect(isOverdue('2026-09-05', new Date(2026, 8, 5, 23, 59))).toBe(false);
		expect(isOverdue('2026-09-05', new Date(2026, 8, 6, 0, 0))).toBe(true);
	});

	it('judges a datetime against the current minute', () => {
		expect(isOverdue('2026-09-05T14:30', NOW)).toBe(true);
		expect(isOverdue('2026-09-05T15:00', NOW)).toBe(false);
		expect(isOverdue('2026-09-05T15:00', new Date(2026, 8, 5, 15, 0))).toBe(false);
		expect(isOverdue('2026-09-05T15:01', new Date(2026, 8, 5, 15, 0))).toBe(false);
		expect(isOverdue('2026-09-04T23:59', NOW)).toBe(true);
	});

	it('is always overdue for anything before today, and never for future dates', () => {
		expect(isOverdue('2026-09-04', NOW)).toBe(true);
		expect(isOverdue('2026-09-06', NOW)).toBe(false);
	});
});

describe('isDueToday', () => {
	it('is true for a date-only deadline on its own day, false afterwards', () => {
		expect(isDueToday('2026-09-05', NOW)).toBe(true);
		expect(isDueToday('2026-09-06', NOW)).toBe(false);
		expect(isDueToday('2026-09-04', NOW)).toBe(false);
	});

	it('is true for a datetime later today, false once its time has passed', () => {
		expect(isDueToday('2026-09-05T16:00', NOW)).toBe(true);
		expect(isDueToday('2026-09-05T14:30', NOW)).toBe(false);
	});
});

describe('formatDeadline / formatDeadlineTime', () => {
	it('formats a date-only deadline without a time', () => {
		expect(formatDeadline('2026-09-05', 'en-US')).toBe('Sep 5');
	});

	it('formats a datetime deadline with a locale time style', () => {
		expect(formatDeadline('2026-09-05T14:30', 'en-US')).toMatch(/^Sep 5, \d{1,2}:\d{2} (AM|PM)$/);
		expect(formatDeadlineTime('2026-09-05T14:30', 'en-US')).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
		expect(formatDeadlineTime('2026-09-05', 'en-US')).toBe('');
	});
});

describe('deadlineChip', () => {
	it('renders a neutral "Required by" chip for future deadlines', () => {
		expect(deadlineChip('2026-09-11', NOW)).toEqual({
			label: 'Required by Sep 11',
			overdue: false,
			dueToday: false
		});
	});

	it('renders an amber "Today" chip, with the time appended when set', () => {
		expect(deadlineChip('2026-09-05', NOW)).toEqual({
			label: 'Today',
			overdue: false,
			dueToday: true
		});
		const laterToday = deadlineChip('2026-09-05T16:00', NOW);
		expect(laterToday.dueToday).toBe(true);
		expect(laterToday.overdue).toBe(false);
		expect(laterToday.label).toMatch(/^Today, \d{1,2}:\d{2} (AM|PM)$/);
	});

	it('renders a red "Overdue" chip once the deadline passes, including the date', () => {
		const overdueDate = deadlineChip('2026-09-04', NOW);
		expect(overdueDate.overdue).toBe(true);
		expect(overdueDate.dueToday).toBe(false);
		expect(overdueDate.label).toBe('Overdue (Sep 4)');

		const overdueTime = deadlineChip('2026-09-05T14:30', NOW);
		expect(overdueTime.overdue).toBe(true);
		expect(overdueTime.label).toMatch(/^Overdue \(Sep 5, \d{1,2}:\d{2} (AM|PM)\)$/);
	});
});
