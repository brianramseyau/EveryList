<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Select, Toggle } from 'flowbite-svelte';
	import type { AlexaPreferenceDto, ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchLists } from '$lib/api/lists';
	import { fetchAlexaPreference, updateAlexaPreference } from '$lib/api/alexa';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Loader from '$lib/components/Loader.svelte';

	let lists = $state<ListDto[]>([]);
	let preference = $state<AlexaPreferenceDto | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function loadAll() {
		loading = true;
		try {
			[lists, preference] = await Promise.all([fetchLists(), fetchAlexaPreference()]);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load Alexa settings.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
			return;
		}
		void loadAll();
	});

	async function onupdate(
		input: Partial<Pick<AlexaPreferenceDto, 'defaultListId' | 'showChecked'>>
	) {
		try {
			preference = await updateAlexaPreference(input);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update Alexa settings.';
		}
	}
</script>

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="Alexa" backHref={resolve('/settings')} />

	<p class="text-sm text-gray-600 dark:text-gray-400">
		These apply to every list you view on Alexa — voice commands and the on-screen show/hide button
		(Echo Show/Hub) change the same settings shown here.
	</p>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loading}
		<Loader />
	{:else if preference}
		{@const showChecked = preference.showChecked ?? true}
		<section class="flex flex-col gap-4">
			<div class="flex flex-col gap-1">
				<span class="text-xs text-gray-500 dark:text-gray-400">Default list</span>
				<Select
					aria-label="Default list"
					size="sm"
					placeholder=""
					items={[
						{ value: '', name: 'Ask each time' },
						...lists.map((list) => ({ value: String(list.id), name: list.name }))
					]}
					value={preference.defaultListId !== null ? String(preference.defaultListId) : ''}
					onchange={(event) => {
						const value = (event.target as HTMLSelectElement).value;
						void onupdate({ defaultListId: value ? Number(value) : null });
					}}
				/>
				<span class="text-xs text-gray-500 dark:text-gray-400">
					Used when a voice request names no list and you have more than one — "set groceries as my
					default list" sets this the same way.
				</span>
			</div>

			<Toggle checked={showChecked} onchange={() => void onupdate({ showChecked: !showChecked })}>
				Show checked items
			</Toggle>
			<span class="-mt-3 text-xs text-gray-500 dark:text-gray-400">
				Struck through, in their normal position — off hides them entirely, same as "hide checked
				items" by voice or the on-screen button.
			</span>
		</section>
	{/if}
</main>
