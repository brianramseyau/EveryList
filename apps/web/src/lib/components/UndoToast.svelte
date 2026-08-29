<script lang="ts">
	import { onMount } from 'svelte';

	// Small, generic undo toast (PLAN_20_PHASE_UNDO_DELETE_TOAST.md) — a fixed bottom banner with
	// a single action, auto-dismissing after `durationMs`. `onDismiss` fires only when the timer
	// elapses without the action being taken; it does not fire on `onAction` or on unmount, since
	// both of those are the caller's own doing, not a timeout to react to.
	let {
		message,
		actionLabel = 'Undo',
		durationMs = 5000,
		onAction,
		onDismiss
	}: {
		message: string;
		actionLabel?: string;
		durationMs?: number;
		onAction: () => void;
		onDismiss?: () => void;
	} = $props();

	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		timeoutId = setTimeout(() => {
			timeoutId = undefined;
			onDismiss?.();
		}, durationMs);

		return () => {
			if (timeoutId !== undefined) clearTimeout(timeoutId);
		};
	});

	// Only reachable while mounted with the timer still armed — clicking Undo after it has
	// already fired is impossible, since firing dismisses (unmounts) the toast.
	function handleAction() {
		clearTimeout(timeoutId);
		onAction();
	}
</script>

<div
	role="status"
	class="fixed inset-x-4 z-20 mx-auto flex app-max-w items-center justify-between gap-3 rounded-t-xl border border-b-0 border-amber-300 bg-amber-50 px-4 py-2 text-sm shadow-sm dark:border-amber-700 dark:bg-amber-900/30 print:hidden"
	style="bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom));"
>
	<span class="text-amber-900 dark:text-amber-200">{message}</span>
	<button
		type="button"
		class="shrink-0 font-semibold text-amber-900 underline hover:no-underline dark:text-amber-200"
		onclick={handleAction}
	>
		{actionLabel}
	</button>
</div>
