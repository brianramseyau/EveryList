<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from 'flowbite-svelte';
	import { resolve } from '$app/paths';
	import { getToken } from '$lib/api/token';

	let signedIn = $state(false);

	onMount(() => {
		signedIn = Boolean(getToken());
	});
</script>

<svelte:head>
	<title>EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
	<h1 class="text-3xl font-bold">EveryList</h1>
	<p class="text-gray-600 dark:text-gray-300">
		A narrower, sharper shopping-list PWA. See <code>foundational/PLAN.md</code> for the roadmap.
	</p>
	<Button href={resolve('/lists')}>{signedIn ? 'My Lists' : 'Get started'}</Button>
	<div class="flex gap-4 text-sm">
		{#if !signedIn}
			<a href={resolve('/login')} class="text-primary-600 dark:text-primary-400 hover:underline"
				>Log in</a
			>
		{/if}
		<a href={resolve('/settings')} class="text-primary-600 dark:text-primary-400 hover:underline"
			>Settings</a
		>
	</div>
</main>
