<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from 'flowbite-svelte';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import Loader from '$lib/components/Loader.svelte';

	// Decorative only — echoes the real list-card spine/icon language from
	// /lists (see PLAN_08_PHASE_VISUAL_IDENTITY.md "The Index") to show the app's range of use
	// without a single grocery-specific example dominating the hero.
	const heroLists: { name: string; icon: string; color: string }[] = [
		{ name: 'Weekend packing', icon: 'briefcase', color: '#3e4c63' },
		{ name: 'Groceries', icon: 'cart', color: '#2e8b57' },
		{ name: 'Book wishlist', icon: 'star', color: '#c026d3' },
		{ name: 'Move-in chores', icon: 'home', color: '#d97706' }
	];

	// This page is prerendered (see +page.ts's own comment on why it stays that way), so its
	// baked-in HTML is generated once at build time with no way to know a real visitor's auth or
	// setup state. Defaulting to a neutral loading placeholder — false here, flipped once mounted
	// runs, which SSR/prerendering never executes — means the *static* HTML never shows this
	// splash's real content, only this placeholder. `+page.ts`'s `load` (which reruns after
	// hydration) has usually already redirected signed-in/setup-needed visitors away by the time
	// this would otherwise flip true, so the splash below only actually appears for a visitor for
	// whom it's the correct destination.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
</script>

<svelte:head>
	<title>EveryList</title>
</svelte:head>

{#if mounted}
	<main
		class="mx-auto flex max-w-lg flex-col items-center gap-6 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8 text-center"
	>
		<div class="flex flex-col items-center gap-2">
			<h1 class="font-display text-4xl font-bold">EveryList</h1>
			<p class="text-gray-600 dark:text-gray-300">
				One place for every list you keep — shared, offline-first, self-hosted.
			</p>
		</div>

		<ul class="flex flex-col gap-2 self-stretch" aria-hidden="true">
			{#each heroLists as item, i (item.name)}
				<li
					class="flex items-center gap-3 rounded-lg border border-l-4 border-gray-200 bg-white/60 p-3 text-left shadow-sm dark:border-gray-700 dark:bg-gray-900/40"
					style:border-left-color={item.color}
					style="transform: rotate({i % 2 === 0 ? -0.6 : 0.6}deg);"
				>
					<span
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
						style:background-color={item.color}
					>
						<Icon name={item.icon} class="h-4 w-4" />
					</span>
					<span class="font-display text-sm font-medium">{item.name}</span>
				</li>
			{/each}
		</ul>

		<Button href={resolve('/login')}>Log in</Button>
	</main>
{:else}
	<Loader />
{/if}
