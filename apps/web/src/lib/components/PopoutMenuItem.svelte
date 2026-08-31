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
	// `disabled:` only applies via the native :disabled pseudo-class, which an <a> can never
	// match — so the disabled-link case computes the same grey-out look from `disabled` directly
	// rather than relying on a CSS variant, keeping a disabled link visually identical to a
	// disabled button (e.g. "Clear Checked Off Items").
	const buttonClass = $derived(
		`${base} disabled:cursor-not-allowed disabled:opacity-40${dividerSuffix}`
	);
	const linkClass = $derived(
		disabled
			? `${buttonClass} cursor-not-allowed opacity-40 hover:bg-transparent dark:hover:bg-transparent`
			: buttonClass
	);

	// A disabled <a> isn't a native concept — the click still navigates unless stopped, so a
	// disabled link renders with aria-disabled + a preventDefault handler instead of an href-less
	// element, keeping the same tag (and its layout) in both states.
	function handleLinkClick(event: MouseEvent) {
		if (disabled) {
			event.preventDefault();
			return;
		}
		onclick?.();
	}
</script>

{#if href}
	<a
		{href}
		onclick={handleLinkClick}
		aria-disabled={disabled}
		tabindex={disabled ? -1 : undefined}
		class={linkClass}
	>
		{@render children()}
	</a>
{:else}
	<button type="button" {onclick} {disabled} class={buttonClass}>{@render children()}</button>
{/if}
