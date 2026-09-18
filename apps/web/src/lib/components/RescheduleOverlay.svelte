<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { Input, Label } from 'flowbite-svelte';
	import { updateItem } from '$lib/api/items';
	import {
		getDeadlineNotificationsPreference,
		resyncDeadlineNotifications
	} from '$lib/notifications/sync';
	import {
		addHoursToDeadline,
		formatDeadline,
		hasTime,
		nextWeekDeadline,
		splitDeadline,
		thisWeekendDeadline,
		tomorrowDeadline
	} from '$lib/deadline';

	// Same overlay shell as ConfirmDialog.svelte (backdrop, centered card, alertdialog role, focus
	// restore, outside-click/Escape dismissal) but with a vertical list of reschedule shortcuts
	// instead of two confirm/cancel buttons — reached from the deadline notification's "Reschedule"
	// action (see push-sw.js / native.ts), which opens this item with a `?reschedule=1` query param.
	let {
		listId,
		itemId,
		deadline,
		onClose
	}: {
		listId: number;
		itemId: number;
		deadline: string;
		// Called with the new deadline after a successful reschedule, or with no argument on
		// cancel/Escape/outside-click — the caller (the item page) needs the new value to update
		// its own `item`/drafts, or a later Save would silently send the stale pre-reschedule
		// deadline right back over this change.
		onClose: (newDeadline?: string) => void;
	} = $props();

	let dialogEl: HTMLDivElement | undefined = $state();
	let customMode = $state(false);
	// Seeded once from the initial deadline, not kept in sync with it — the prop never changes
	// across this dialog's lifetime (one item, opened fresh each time).
	let customDate = $state(untrack(() => splitDeadline(deadline).date));
	let customTime = $state(untrack(() => splitDeadline(deadline).time));
	let saving = $state(false);
	let error = $state<string | null>(null);
	const titleId = $props.id();

	onMount(() => {
		const previouslyFocused = document.activeElement as HTMLElement | null;
		dialogEl?.querySelector<HTMLButtonElement>('button')?.focus();
		return () => previouslyFocused?.focus?.();
	});

	function handleWindowClick(event: MouseEvent) {
		if (!saving && dialogEl && !event.composedPath().includes(dialogEl)) onClose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !saving) {
			onClose();
			return;
		}
		// Unlike ConfirmDialog (always exactly two focusable elements, wrapped by identity), this
		// dialog's focusable set varies with mode (shortcut buttons + Custom, or Back/date/
		// time/Apply) and with `saving`/loading disabling buttons — so this queries the live set on
		// every Tab instead of caching it, and wraps between whichever elements are first/last.
		if (event.key !== 'Tab' || !dialogEl) return;
		const focusable = dialogEl.querySelectorAll<HTMLElement>(
			'button:not([disabled]), input:not([disabled])'
		);
		if (focusable.length === 0) {
			// Every button (including Cancel) disables itself while saving, so there's nothing to
			// wrap Tab between — but the click that started the save already blurred the (now
			// disabled) button back to `body`, so without this a Tab here would walk straight into
			// the page behind the dialog. Holding focus on the dialog itself keeps it trapped for
			// that window.
			event.preventDefault();
			dialogEl.focus();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	// Only ever invoked from the shortcut/Apply buttons below, both of which disable themselves
	// via `saving` — no separate re-entrancy guard needed here.
	async function apply(nextDeadline: string) {
		saving = true;
		error = null;
		try {
			await updateItem(listId, itemId, { deadline: nextDeadline });
			if (getDeadlineNotificationsPreference()) void resyncDeadlineNotifications();
			onClose(nextDeadline);
		} catch {
			error = "Couldn't reschedule the item. Try again.";
			saving = false;
		}
	}

	// The Apply button is disabled while customDate is empty, so this is only ever reached with a
	// non-empty date.
	function applyCustom() {
		void apply(customTime ? `${customDate}T${customTime}` : customDate);
	}

	const shortcuts = $derived(
		(
			[
				hasTime(deadline) ? { label: '1 hour', deadline: addHoursToDeadline(deadline, 1) } : null,
				{ label: 'Tomorrow', deadline: tomorrowDeadline(deadline) },
				{ label: 'This weekend', deadline: thisWeekendDeadline(deadline) },
				{ label: 'Next week', deadline: nextWeekDeadline(deadline) }
			] as const
		).filter((shortcut): shortcut is { label: string; deadline: string } => shortcut !== null)
	);
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 print:hidden">
	<div
		bind:this={dialogEl}
		tabindex="-1"
		class="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby={titleId}
	>
		<p id={titleId} class="font-medium text-gray-900 dark:text-gray-100">Reschedule</p>

		{#if error}
			<p class="text-red-600 dark:text-red-400">{error}</p>
		{/if}

		{#if !customMode}
			<div class="flex flex-col gap-2">
				{#each shortcuts as shortcut (shortcut.label)}
					<button
						type="button"
						class="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-700"
						disabled={saving}
						onclick={() => apply(shortcut.deadline)}
					>
						<span class="text-gray-900 dark:text-gray-100">{shortcut.label}</span>
						<span class="text-gray-500 dark:text-gray-400">{formatDeadline(shortcut.deadline)}</span
						>
					</button>
				{/each}
				<button
					type="button"
					class="rounded-lg border border-gray-200 px-3 py-2 text-left text-gray-900 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-700"
					disabled={saving}
					onclick={() => (customMode = true)}
				>
					Custom…
				</button>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<Label for="reschedule-date">Date</Label>
						<Input id="reschedule-date" type="date" bind:value={customDate} />
					</div>
					<div class="flex flex-col gap-1">
						<Label for="reschedule-time">Time (optional)</Label>
						<Input id="reschedule-time" type="time" bind:value={customTime} />
					</div>
				</div>
				<div class="flex justify-end gap-2">
					<button
						type="button"
						class="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
						disabled={saving}
						onclick={() => (customMode = false)}
					>
						Back
					</button>
					<button
						type="button"
						class="rounded-lg bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
						disabled={saving || !customDate}
						onclick={applyCustom}
					>
						Apply
					</button>
				</div>
			</div>
		{/if}

		<div class="flex justify-end border-t border-gray-200 pt-3 dark:border-gray-700">
			<button
				type="button"
				class="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
				disabled={saving}
				onclick={() => onClose()}
			>
				Cancel
			</button>
		</div>
	</div>
</div>
