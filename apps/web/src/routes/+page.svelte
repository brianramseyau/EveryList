<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
	<h1 class="text-3xl font-bold">EveryList</h1>
	<p class="text-gray-600 dark:text-gray-300">
		A narrower, sharper shopping-list PWA. The app is still under construction — see
		<code>foundational/PLAN.md</code> for the roadmap.
	</p>
	<Button>Coming soon</Button>
	<a
		href={resolve('/settings')}
		class="text-primary-600 dark:text-primary-400 text-sm hover:underline">Settings</a
	>
</main>
