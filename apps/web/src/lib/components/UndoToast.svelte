<script lang="ts">
	import { onMount } from 'svelte';
	import { swipeDismiss } from '$lib/actions/swipe-dismiss';

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

	// Shared by the auto-dismiss timer and the swipe gesture. Cancels the
	// timer first so a swipe dismissal can't be followed by a second onDismiss
	// from the still-armed timeout, even if a caller's onDismiss doesn't
	// unmount the toast (the Undo button's handleAction cancels it the same
	// way). clearTimeout on an already-fired or already-cleared id is a no-op.
	function dismiss() {
		clearTimeout(timeoutId);
		timeoutId = undefined;
		onDismiss?.();
	}

	onMount(() => {
		timeoutId = setTimeout(dismiss, durationMs);

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
	use:swipeDismiss={{ onDismiss: dismiss }}
	class="fixed inset-x-4 z-20 mx-auto flex app-max-w touch-pan-x items-center justify-between gap-3 rounded-t-xl border border-b-0 border-amber-300 bg-amber-50 px-4 py-2 text-sm shadow-sm dark:border-amber-700 dark:bg-amber-900 print:hidden"
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
