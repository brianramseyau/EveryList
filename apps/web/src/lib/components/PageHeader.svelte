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
	//
	// htmlTitle overrides the derived <title> text when a page's document
	// title doesn't algorithmically match its visible `title` (different
	// wording, or a different loading-state fallback) — when omitted, the
	// document title derives from `title` itself.
	//
	// fixed pins this header (and any extra content passed via the `extra`
	// snippet, e.g. a search/add-item bar that must scroll away with it) to
	// the top of the viewport — not always desired, so it defaults off.
	// `height` is bound out to the fixed wrapper's measured clientHeight so
	// the page can offset its own scrollable content by the right amount.
	let {
		title,
		htmlTitle,
		backHref,
		backLabel = 'Back',
		actions,
		fixed = false,
		extra,
		height = $bindable(0)
	}: {
		title?: string;
		htmlTitle?: string;
		backHref?: ResolvedPathname;
		backLabel?: string;
		actions?: Snippet;
		fixed?: boolean;
		extra?: Snippet;
		height?: number;
	} = $props();

	const documentTitle = $derived(htmlTitle ?? title);
</script>

{#snippet headerRow()}
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
{/snippet}

<svelte:head>
	<!-- Always rendered (no wrapping {#if}) and the fallback text baked into
	     one ternary, matching how every page used to write this by hand —
	     Svelte compiles <title> specially into a raw `document.title = ...`
	     assignment rather than routing it through the runtime's null-safe
	     `set_text` helper, so a value that's only conditionally interpolated
	     (behind a genuinely-nullable expression that a wrapping {#if} would
	     require) bakes in an `?? ''` fallback this component can never
	     actually reach — no real caller ever renders PageHeader without a
	     title, so that branch is uncoverable dead code under the 100%
	     branch-coverage gate. -->
	<title>{documentTitle ? `${documentTitle} — EveryList` : 'EveryList'}</title>
</svelte:head>

{#if fixed}
	<div
		class="fixed inset-x-0 top-0 z-20 mx-auto flex max-w-lg flex-col gap-1 bg-paper px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-1"
		style="touch-action: pan-x pan-y; transform: translateZ(0); will-change: transform;"
		bind:clientHeight={height}
	>
		{@render headerRow()}
		{#if extra}{@render extra()}{/if}
	</div>
{:else}
	{@render headerRow()}
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
