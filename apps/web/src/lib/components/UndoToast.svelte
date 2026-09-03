<script lang="ts">
	import { onMount } from 'svelte';
	import { swipeDismiss } from '$lib/actions/swipe-dismiss';

	// Small, generic undo toast (PLAN_20_PHASE_UNDO_DELETE_TOAST.md) — a fixed bottom banner with
	// a single action, auto-dismissing after `durationMs`. `onDismiss` fires only when the timer
	// elapses without the action being taken; it does not fire on `onAction` or on unmount, since
	// both of those are the caller's own doing, not a timeout to react to. `variant: 'error'` (red,
	// PLAN_25_PHASE_OPEN_ITEM_LIMIT.md's 2026-09-03 revision) reuses this same shape for a blocking
	// error rather than an undoable action — callers just pass a dismiss-only `onAction`.
	let {
		message,
		actionLabel = 'Undo',
		durationMs = 5000,
		variant = 'warning',
		onAction,
		onDismiss
	}: {
		message: string;
		actionLabel?: string;
		durationMs?: number;
		variant?: 'warning' | 'error';
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
	class="fixed inset-x-4 z-20 mx-auto flex app-max-w touch-pan-x items-center justify-between gap-3 rounded-t-xl border border-b-0 px-4 py-2 text-sm shadow-sm print:hidden {variant ===
	'error'
		? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900'
		: 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900'}"
	style="bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom));"
>
	<span class={variant === 'error' ? 'text-red-900 dark:text-red-200' : 'text-amber-900 dark:text-amber-200'}
		>{message}</span
	>
	<button
		type="button"
		class="shrink-0 font-semibold underline hover:no-underline {variant === 'error'
			? 'text-red-900 dark:text-red-200'
			: 'text-amber-900 dark:text-amber-200'}"
		onclick={handleAction}
	>
		{actionLabel}
	</button>
</div>
