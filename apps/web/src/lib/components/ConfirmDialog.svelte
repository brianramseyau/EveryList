<script lang="ts">
	// Centered over a darkened overlay, matching the confirm pattern already
	// used for destructive list actions (see lists/[id]/+page.svelte) —
	// extracted here so any page can reuse it instead of hand-rolling its own.
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

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onCancel();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 print:hidden">
	<div
		class="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
		role="alertdialog"
		aria-modal="true"
		aria-label={message}
	>
		<p class="text-gray-700 dark:text-gray-200">{message}</p>
		<div class="flex justify-end gap-2">
			<button
				type="button"
				class="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
				onclick={onCancel}
			>
				{cancelLabel}
			</button>
			<button
				type="button"
				class="rounded-lg bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
				onclick={onConfirm}
			>
				{confirmLabel}
			</button>
		</div>
	</div>
</div>
