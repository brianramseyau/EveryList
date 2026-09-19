<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { impersonatedLabel, stopImpersonation } from '$lib/api/impersonation.svelte';

	let busy = $state(false);

	async function exit() {
		busy = true;
		try {
			await stopImpersonation();
		} catch (err) {
			// The admin session is already restored by this point; only cache cleanup can fail.
			console.error('Failed to fully clean up after impersonation', err);
		} finally {
			busy = false;
		}
		await goto(resolve('/admin/users'));
	}
</script>

{#if impersonatedLabel()}
	<div
		role="status"
		class="fixed inset-x-4 bottom-20 z-30 mx-auto flex app-max-w items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm shadow-sm dark:border-amber-700 dark:bg-amber-900/40 print:hidden"
	>
		<span class="min-w-0 truncate text-amber-900 dark:text-amber-200">
			Viewing as <strong>{impersonatedLabel()}</strong>
		</span>
		<button
			type="button"
			disabled={busy}
			class="shrink-0 font-semibold text-amber-900 underline hover:no-underline disabled:opacity-50 dark:text-amber-200"
			onclick={exit}
		>
			Exit
		</button>
	</div>
{/if}
