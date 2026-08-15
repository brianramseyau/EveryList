<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ResolvedPathname } from '$app/types';

	// backHref must be the return value of $app/paths' resolve() — typed as
	// ResolvedPathname rather than a plain string so eslint-plugin-svelte's
	// no-navigation-without-resolve rule can verify that at each call site
	// instead of only inside this component.
	let {
		title,
		backHref,
		backLabel = 'Back',
		actions
	}: {
		title?: string;
		backHref?: ResolvedPathname;
		backLabel?: string;
		actions?: Snippet;
	} = $props();
</script>

{#if backHref}
	<a href={backHref} class="text-sm text-primary-700 underline dark:text-primary-400 print:hidden"
		>← <span>{backLabel}</span></a
	>
{/if}

{#if title}
	<div class="flex items-center justify-between border-b border-gray-200 pb-2 dark:border-gray-700">
		<h1 class="font-display text-2xl font-bold">{title}</h1>
		{#if actions}
			<div class="flex items-center gap-3 text-sm print:hidden">{@render actions()}</div>
		{/if}
	</div>
{/if}
