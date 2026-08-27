<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ResolvedPathname } from '$app/types';

	// Shared popout-menu item (PLAN_09_PHASE_REFINEMENTS.md #1/#10): a single link/button row
	// inside a PopoutMenu panel. Renders an <a> when `href` is set, a <button>
	// otherwise — centralising the touch-sized styling that used to be
	// copy-pasted into every PopoutMenu call site.
	//
	// href must be the return value of $app/paths' resolve() — typed as
	// ResolvedPathname rather than a plain string (same rationale as
	// PageHeader.svelte's backHref) so eslint-plugin-svelte's
	// no-navigation-without-resolve rule verifies that at each call site
	// instead of only inside this component.
	let {
		href = undefined,
		onclick = undefined,
		disabled = false,
		divider = false,
		children
	}: {
		href?: ResolvedPathname;
		onclick?: () => void;
		disabled?: boolean;
		divider?: boolean;
		children: Snippet;
	} = $props();

	const base =
		'block w-full rounded px-3 py-2.5 text-left text-base whitespace-nowrap text-primary-700 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700';
	const dividerClass = 'mt-1 border-t border-gray-200 dark:border-gray-700';
	const dividerSuffix = $derived(divider ? ` ${dividerClass}` : '');
	const linkClass = $derived(base + dividerSuffix);
	const buttonClass = $derived(
		`${base} disabled:cursor-not-allowed disabled:opacity-40${dividerSuffix}`
	);
</script>

{#if href}
	<a {href} class={linkClass}>{@render children()}</a>
{:else}
	<button type="button" {onclick} {disabled} class={buttonClass}>{@render children()}</button>
{/if}
