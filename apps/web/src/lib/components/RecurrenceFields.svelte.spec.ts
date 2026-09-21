import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { RecurrenceRule } from '@everylist/shared';
import RecurrenceFields from './RecurrenceFields.svelte';

// 2026-09-11 is a Friday.
const DATE = '2026-09-11';

function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
	return {
		interval: 1,
		unit: 'day',
		weekdays: [],
		monthly: null,
		startDate: DATE,
		end: { type: 'never' },
		...overrides
	};
}

const toggle = () => page.getByRole('checkbox', { name: 'Repeat', exact: true });

describe('RecurrenceFields.svelte', () => {
	it('is off by default and hides the editor', async () => {
		render(RecurrenceFields, { deadlineDate: DATE });

		await expect.element(toggle()).not.toBeChecked();
		await expect.element(page.getByLabelText('Repeat every')).not.toBeInTheDocument();
	});

	it('turning it on starts weekly on the deadline weekday, and off clears it again', async () => {
		render(RecurrenceFields, { deadlineDate: DATE });

		await toggle().click();
		await expect.element(page.getByLabelText('Repeat every')).toHaveValue(1);
		await expect.element(page.getByLabelText('Unit')).toHaveValue('week');
		await expect.element(page.getByLabelText('Starts')).toHaveValue(DATE);
		await expect
			.element(page.getByRole('button', { name: 'Friday' }))
			.toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByTestId('repeat-preview')).toHaveTextContent('Next: Sep 11');

		await toggle().click();
		await expect.element(page.getByLabelText('Repeat every')).not.toBeInTheDocument();
	});

	it('pluralises the unit labels for an interval above one', async () => {
		render(RecurrenceFields, { deadlineDate: DATE, recurrence: rule({ interval: 2 }) });

		await expect.element(page.getByLabelText('Unit')).toHaveTextContent('days');
	});

	it('edits the interval and shows the next two dates', async () => {
		render(RecurrenceFields, { deadlineDate: DATE, recurrence: rule() });

		await page.getByLabelText('Repeat every').fill('3');
		await expect
			.element(page.getByTestId('repeat-preview'))
			.toHaveTextContent('Next: Sep 11, then Sep 14');
	});

	it('toggles weekdays but never removes the last one', async () => {
		render(RecurrenceFields, {
			deadlineDate: DATE,
			recurrence: rule({ unit: 'week', weekdays: [5] })
		});

		const monday = page.getByRole('button', { name: 'Monday' });
		const friday = page.getByRole('button', { name: 'Friday' });

		await friday.click();
		await expect.element(friday).toHaveAttribute('aria-pressed', 'true');

		await monday.click();
		await expect.element(monday).toHaveAttribute('aria-pressed', 'true');
		await friday.click();
		await expect.element(friday).toHaveAttribute('aria-pressed', 'false');
	});

	it('switching to month offers day-of-month, and to week reseeds the weekday', async () => {
		render(RecurrenceFields, { deadlineDate: DATE, recurrence: rule() });

		await page.getByLabelText('Unit').selectOptions('month');
		await expect.element(page.getByLabelText('Day of the month')).toHaveValue(11);
		await page.getByLabelText('Day of the month').fill('21');
		await expect
			.element(page.getByTestId('repeat-preview'))
			.toHaveTextContent('Next: Sep 21, then Oct 21');

		await page.getByLabelText('Unit').selectOptions('week');
		await expect
			.element(page.getByRole('button', { name: 'Friday' }))
			.toHaveAttribute('aria-pressed', 'true');

		await page.getByLabelText('Unit').selectOptions('year');
		await expect.element(page.getByRole('group', { name: 'Repeat on' })).not.toBeInTheDocument();
	});

	it('supports First/Second/Third/Fourth/Last + weekday for months', async () => {
		render(RecurrenceFields, {
			deadlineDate: DATE,
			recurrence: rule({ unit: 'month', monthly: { kind: 'dayOfMonth', day: 11 } })
		});

		await page.getByLabelText('Repeat on').selectOptions('nth');
		// The 11th is the second Friday of the month.
		await expect.element(page.getByLabelText('Which')).toHaveValue('2');
		await expect.element(page.getByLabelText('Day', { exact: true })).toHaveValue('5');

		await page.getByLabelText('Which').selectOptions('-1');
		await page.getByLabelText('Day', { exact: true }).selectOptions('1');
		await expect
			.element(page.getByTestId('repeat-preview'))
			.toHaveTextContent('Next: Sep 28, then Oct 26');

		await page.getByLabelText('Repeat on').selectOptions('day');
		await expect.element(page.getByLabelText('Day of the month')).toHaveValue(11);
	});

	it('caps the derived week-of-month at fourth for a start on the fifth week', async () => {
		// 2026-09-29 is a Tuesday in the fifth week.
		render(RecurrenceFields, {
			deadlineDate: '2026-09-29',
			recurrence: rule({
				startDate: '2026-09-29',
				unit: 'month',
				monthly: { kind: 'dayOfMonth', day: 29 }
			})
		});

		await page.getByLabelText('Repeat on').selectOptions('nth');
		await expect.element(page.getByLabelText('Which')).toHaveValue('4');
	});

	it('shows an implicit anchor-day month rule as day of the month', async () => {
		render(RecurrenceFields, { deadlineDate: DATE, recurrence: rule({ unit: 'month' }) });

		await expect.element(page.getByLabelText('Day of the month')).toHaveValue(11);
	});

	it('changes the start date', async () => {
		render(RecurrenceFields, { deadlineDate: DATE, recurrence: rule() });

		await page.getByLabelText('Starts').fill('2026-10-01');
		await expect.element(page.getByTestId('repeat-preview')).toHaveTextContent('Next: Oct 1');
	});

	it('flags a cleared start date instead of previewing a nonsense one', async () => {
		render(RecurrenceFields, { deadlineDate: DATE, recurrence: rule() });

		await page.getByLabelText('Starts').fill('');
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('A valid start date is required');
		await expect.element(page.getByTestId('repeat-preview')).not.toBeInTheDocument();
	});

	it('flags a fractional interval', async () => {
		render(RecurrenceFields, { deadlineDate: DATE, recurrence: rule() });

		await page.getByLabelText('Repeat every').fill('2.5');
		await expect.element(page.getByRole('alert')).toHaveTextContent('whole number');
	});

	it('ends never, on a date, or after N occurrences', async () => {
		render(RecurrenceFields, { deadlineDate: DATE, recurrence: rule() });

		await page.getByLabelText('Ends').selectOptions('on');
		await expect.element(page.getByLabelText('End date')).toHaveValue(DATE);
		await page.getByLabelText('End date').fill('2026-09-20');
		await expect.element(page.getByTestId('repeat-preview')).toHaveTextContent('Sep 12');

		await page.getByLabelText('Ends').selectOptions('after');
		await expect.element(page.getByLabelText('Occurrences')).toHaveValue(10);
		await page.getByLabelText('Occurrences').fill('1');
		// One occurrence means there is no "then".
		await expect.element(page.getByTestId('repeat-preview')).not.toHaveTextContent('then');

		await page.getByLabelText('Ends').selectOptions('never');
		await expect.element(page.getByLabelText('Occurrences')).not.toBeInTheDocument();
	});

	it('shows the problem instead of a preview for an invalid rule', async () => {
		render(RecurrenceFields, { deadlineDate: DATE, recurrence: rule() });

		await page.getByLabelText('Ends').selectOptions('on');
		await page.getByLabelText('End date').fill('2026-09-01');
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('The end date cannot be before the start date');
		await expect.element(page.getByTestId('repeat-preview')).not.toBeInTheDocument();
	});
});
