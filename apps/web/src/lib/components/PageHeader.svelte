<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ResolvedPathname } from '$app/types';
	import { markBackNavigation } from '$lib/nav-direction';
	import Icon from './Icon.svelte';

	// backHref must be the return value of $app/paths' resolve() — typed as
	// ResolvedPathname rather than a plain string so eslint-plugin-svelte's
	// no-navigation-without-resolve rule can verify that at each call site
	// instead of only inside this component.
	//
	// backLabel is not rendered as visible text (PHASE9_PLAN.md #2 — icon-only
	// back arrow, for consistent header placement across screens) — it's only
	// the icon's accessible name.
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

{#if title}
	<div class="flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
		{#if backHref}
			<a
				href={backHref}
				onclick={markBackNavigation}
				aria-label={backLabel}
				class="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-700 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-800 print:hidden"
			>
				<Icon name="arrowLeft" class="h-6 w-6" />
			</a>
		{/if}
		<h1 class="header-title flex-1 font-display text-2xl font-bold">{title}</h1>
		{#if actions}
			<div class="flex items-center gap-3 text-sm print:hidden">{@render actions()}</div>
		{/if}
	</div>
{:else if backHref}
	<a
		href={backHref}
		aria-label={backLabel}
		class="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-primary-700 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-800 print:hidden"
	>
		<Icon name="arrowLeft" class="h-6 w-6" />
	</a>
{/if}

<style>
	/* A tap on the title (adjacent to the back button) can trigger the
	   browser's native text-selection/copy menu on mobile instead of
	   registering as a tap on the back button right next to it. */
	.header-title {
		user-select: none;
		-webkit-user-select: none;
	}
</style>
