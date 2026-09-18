<script lang="ts">
	import { onMount } from 'svelte';

	// Centered over a darkened overlay, matching the confirm pattern already
	// used for destructive list actions (see lists/[id]/+page.svelte:1258-1293,
	// including its outside-click/Escape dismissal) — extracted here so any
	// page can reuse it instead of hand-rolling its own.
	let {
		message,
		confirmLabel = 'Discard',
		cancelLabel = 'Cancel',
		onConfirm,
		onCancel
	}: {
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		onConfirm: () => void;
		onCancel: () => void;
	} = $props();

	let dialogEl: HTMLDivElement | undefined = $state();
	let cancelButtonEl: HTMLButtonElement | undefined = $state();
	let confirmButtonEl: HTMLButtonElement | undefined = $state();
	// Unique per instance so nested/sequential dialogs never collide on the id
	// aria-describedby below points at.
	const messageId = $props.id();

	// Cancel (the non-destructive action) gets initial focus, and the
	// previously-focused element (e.g. the back link that triggered this
	// prompt) gets it back once the dialog closes — otherwise focus is left
	// on a now-removed element, or defaults back to the document body.
	onMount(() => {
		const previouslyFocused = document.activeElement as HTMLElement | null;
		cancelButtonEl?.focus();
		return () => previouslyFocused?.focus?.();
	});

	function handleWindowClick(event: MouseEvent) {
		if (dialogEl && !event.composedPath().includes(dialogEl)) onCancel();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onCancel();
			return;
		}
		// Only two focusable elements live in this dialog, so a full trap is
		// just wrapping Tab/Shift+Tab between them instead of letting focus
		// escape to the (still keyboard-reachable, since nothing here makes it
		// inert) page underneath the overlay.
		if (event.key !== 'Tab' || !cancelButtonEl || !confirmButtonEl) return;
		if (event.shiftKey && document.activeElement === cancelButtonEl) {
			event.preventDefault();
			confirmButtonEl.focus();
		} else if (!event.shiftKey && document.activeElement === confirmButtonEl) {
			event.preventDefault();
			cancelButtonEl.focus();
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 print:hidden">
	<div
		bind:this={dialogEl}
		class="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
		role="alertdialog"
		aria-modal="true"
		aria-label="Confirm"
		aria-describedby={messageId}
	>
		<p id={messageId} class="text-gray-700 dark:text-gray-200">{message}</p>
		<div class="flex justify-end gap-2">
			<button
				bind:this={cancelButtonEl}
				type="button"
				class="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
				onclick={onCancel}
			>
				{cancelLabel}
			</button>
			<button
				bind:this={confirmButtonEl}
				type="button"
				class="rounded-lg bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
				onclick={onConfirm}
			>
				{confirmLabel}
			</button>
		</div>
	</div>
</div>
