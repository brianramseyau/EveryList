<script lang="ts">
	import { Input, Label, Select, Toggle } from 'flowbite-svelte';
	import {
		MAX_RECURRENCE_COUNT,
		nextOccurrence,
		recurrenceRuleProblem,
		type RecurrenceRule,
		type RecurrenceUnit
	} from '@everylist/shared';
	import Icon from '$lib/components/Icon.svelte';
	import { formatDeadline } from '$lib/deadline';
	import {
		defaultRecurrenceRule,
		formatRecurrence,
		NTH_OPTIONS,
		snapDeadlineDate,
		WEEKDAY_LONG,
		WEEK_ORDER,
		WEEKDAY_SHORT,
		weekdayOfDate,
		withUnit
	} from '$lib/recurrence';

	// PLAN_30_PHASE_RECURRING_ITEMS.md — the Google Tasks-style "Repeat" editor. Only rendered once
	// the item has a date; `deadlineDate` is that date, the default for "Starts" and the base the
	// "Next" preview snaps onto the rule's grid.
	let {
		recurrence = $bindable(null),
		deadlineDate
	}: {
		recurrence?: RecurrenceRule | null;
		/** 'YYYY-MM-DD' of the item's deadline. */
		deadlineDate: string;
	} = $props();

	const UNIT_ITEMS: { value: RecurrenceUnit; name: string }[] = [
		{ value: 'day', name: 'day' },
		{ value: 'week', name: 'week' },
		{ value: 'month', name: 'month' },
		{ value: 'year', name: 'year' }
	];

	function apply(rule: RecurrenceRule, changes: Partial<RecurrenceRule>) {
		recurrence = { ...rule, ...changes };
	}

	function changeUnit(rule: RecurrenceRule, unit: RecurrenceUnit) {
		recurrence = withUnit(rule, unit);
	}

	function toggleWeekday(rule: RecurrenceRule, weekday: number) {
		const selected = rule.weekdays.includes(weekday);
		// A weekly rule always keeps at least one day — "no days" has no meaning.
		if (selected && rule.weekdays.length === 1) return;
		apply(rule, {
			weekdays: selected
				? rule.weekdays.filter((day) => day !== weekday)
				: [...rule.weekdays, weekday].sort((a, b) => a - b)
		});
	}

	function changeMonthMode(rule: RecurrenceRule, mode: string) {
		if (mode === 'nth') {
			const day = Number(rule.startDate.slice(8, 10));
			apply(rule, {
				monthly: {
					kind: 'nthWeekday',
					nth: Math.min(4, Math.ceil(day / 7)) as 1 | 2 | 3 | 4,
					weekday: weekdayOfDate(rule.startDate)
				}
			});
		} else {
			apply(rule, {
				monthly: { kind: 'dayOfMonth', day: Number(rule.startDate.slice(8, 10)) }
			});
		}
	}

	function changeEnd(rule: RecurrenceRule, type: string) {
		if (type === 'on') apply(rule, { end: { type: 'on', date: rule.startDate } });
		else if (type === 'after') apply(rule, { end: { type: 'after', count: 10 } });
		else apply(rule, { end: { type: 'never' } });
	}

	function numberFrom(event: Event): number {
		return Number((event.currentTarget as HTMLInputElement).value);
	}
</script>

<div class="flex flex-col gap-3">
	<Toggle
		checked={recurrence !== null}
		onchange={() => (recurrence = recurrence ? null : defaultRecurrenceRule(deadlineDate))}
	>
		<span class="flex items-center gap-1">
			<Icon name="repeat" class="h-4 w-4" />
			Repeat
		</span>
	</Toggle>

	{#if recurrence}
		{@const rule = recurrence}
		<!-- The preview date math assumes a valid rule (a zero interval never lands on the grid), so it
		     is only computed in the no-problem branch below. -->
		{@const problem = recurrenceRuleProblem(rule)}
		<div
			class="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
			data-testid="recurrence-fields"
		>
			<div class="grid grid-cols-2 gap-4">
				<div class="flex flex-col gap-1">
					<Label for="repeat-interval">Repeat every</Label>
					<Input
						id="repeat-interval"
						type="number"
						min="1"
						max={MAX_RECURRENCE_COUNT}
						value={rule.interval}
						oninput={(event: Event) => apply(rule, { interval: numberFrom(event) })}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="repeat-unit">Unit</Label>
					<Select
						id="repeat-unit"
						items={UNIT_ITEMS.map((unit) => ({
							value: unit.value,
							name: rule.interval === 1 ? unit.name : `${unit.name}s`
						}))}
						value={rule.unit}
						onchange={(event) =>
							changeUnit(rule, (event.target as HTMLSelectElement).value as RecurrenceUnit)}
					/>
				</div>
			</div>

			{#if rule.unit === 'week'}
				<div class="flex flex-col gap-1">
					<span class="text-sm font-medium text-gray-900 dark:text-gray-300">Repeat on</span>
					<div class="flex gap-1" role="group" aria-label="Repeat on">
						{#each WEEK_ORDER as weekday (weekday)}
							{@const label = WEEKDAY_SHORT[weekday]}
							{@const selected = rule.weekdays.includes(weekday)}
							<button
								type="button"
								aria-pressed={selected}
								aria-label={WEEKDAY_LONG[weekday]}
								class="h-9 flex-1 rounded-lg border text-xs font-medium {selected
									? 'border-primary-600 bg-primary-600 text-white'
									: 'border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'}"
								onclick={() => toggleWeekday(rule, weekday)}
							>
								{label}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if rule.unit === 'month'}
				{@const monthly = rule.monthly}
				<div class="grid grid-cols-2 gap-4">
					<div class="flex flex-col gap-1" class:col-span-2={monthly?.kind !== 'nthWeekday'}>
						<Label for="repeat-month-mode">Repeat on</Label>
						<Select
							id="repeat-month-mode"
							items={[
								{ value: 'day', name: 'Day of the month' },
								{ value: 'nth', name: 'Weekday of the month' }
							]}
							value={monthly?.kind === 'nthWeekday' ? 'nth' : 'day'}
							onchange={(event) => changeMonthMode(rule, (event.target as HTMLSelectElement).value)}
						/>
					</div>
				</div>
				{#if monthly?.kind === 'nthWeekday'}
					<div class="grid grid-cols-2 gap-4">
						<div class="flex flex-col gap-1">
							<Label for="repeat-month-nth">Which</Label>
							<Select
								id="repeat-month-nth"
								items={NTH_OPTIONS.map((option) => ({ value: option.value, name: option.label }))}
								value={monthly.nth}
								onchange={(event) =>
									apply(rule, {
										monthly: {
											...monthly,
											nth: Number((event.target as HTMLSelectElement).value) as 1 | 2 | 3 | 4 | -1
										}
									})}
							/>
						</div>
						<div class="flex flex-col gap-1">
							<Label for="repeat-month-weekday">Day</Label>
							<Select
								id="repeat-month-weekday"
								items={WEEKDAY_LONG.map((name, value) => ({ value, name }))}
								value={monthly.weekday}
								onchange={(event) =>
									apply(rule, {
										monthly: {
											...monthly,
											weekday: Number((event.target as HTMLSelectElement).value)
										}
									})}
							/>
						</div>
					</div>
				{:else}
					<div class="flex flex-col gap-1">
						<Label for="repeat-month-day">Day of the month</Label>
						<Input
							id="repeat-month-day"
							type="number"
							min="1"
							max="31"
							value={monthly?.day ?? Number(rule.startDate.slice(8, 10))}
							oninput={(event: Event) =>
								apply(rule, { monthly: { kind: 'dayOfMonth', day: numberFrom(event) } })}
						/>
					</div>
				{/if}
			{/if}

			<div class="flex flex-col gap-1">
				<Label for="repeat-start">Starts</Label>
				<Input
					id="repeat-start"
					type="date"
					value={rule.startDate}
					oninput={(event: Event) =>
						apply(rule, { startDate: (event.currentTarget as HTMLInputElement).value })}
				/>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="flex flex-col gap-1" class:col-span-2={rule.end.type === 'never'}>
					<Label for="repeat-end">Ends</Label>
					<Select
						id="repeat-end"
						items={[
							{ value: 'never', name: 'Never' },
							{ value: 'on', name: 'On date' },
							{ value: 'after', name: 'After' }
						]}
						value={rule.end.type}
						onchange={(event) => changeEnd(rule, (event.target as HTMLSelectElement).value)}
					/>
				</div>
				{#if rule.end.type === 'on'}
					<div class="flex flex-col gap-1">
						<Label for="repeat-end-date">End date</Label>
						<Input
							id="repeat-end-date"
							type="date"
							value={rule.end.date}
							oninput={(event: Event) =>
								apply(rule, {
									end: { type: 'on', date: (event.currentTarget as HTMLInputElement).value }
								})}
						/>
					</div>
				{:else if rule.end.type === 'after'}
					<div class="flex flex-col gap-1">
						<Label for="repeat-end-count">Occurrences</Label>
						<Input
							id="repeat-end-count"
							type="number"
							min="1"
							max={MAX_RECURRENCE_COUNT}
							value={rule.end.count}
							oninput={(event: Event) =>
								apply(rule, { end: { type: 'after', count: numberFrom(event) } })}
						/>
					</div>
				{/if}
			</div>

			{#if problem}
				<p class="text-sm text-red-600 dark:text-red-400" role="alert">{problem}</p>
			{:else}
				{@const first = snapDeadlineDate(rule, deadlineDate)}
				{@const then = nextOccurrence(rule, 1, first, first)}
				<p class="text-sm text-gray-500 dark:text-gray-400">
					{formatRecurrence(rule)}.
					<span data-testid="repeat-preview">
						Next: {formatDeadline(first)}{then ? `, then ${formatDeadline(then)}` : ''}
					</span>
				</p>
			{/if}
		</div>
	{/if}
</div>
