<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Input, Select } from 'flowbite-svelte';
	import type { FolderDto, ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { deleteList, fetchList, updateList } from '$lib/api/lists';
	import { fetchFolders } from '$lib/api/folders';
	import { ApiError } from '$lib/api/client';
	import { buildPasscodeHash } from '$lib/passcode';
	import { refreshBadgeCount } from '$lib/pwa/badge';
	import IconPicker from '$lib/components/IconPicker.svelte';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let folders = $state<FolderDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let draftName = $state('');
	let draftIcon = $state('formatListChecks');
	let draftColor = $state('#3b82f6');
	let draftFolderId = $state<number | null>(null);
	let savingName = $state(false);
	let confirmingDelete = $state(false);
	let deleting = $state(false);
	let settingPasscode = $state(false);
	let draftPin = $state('');
	let savingPasscode = $state(false);

	async function loadAll() {
		loading = true;
		try {
			[list, folders] = await Promise.all([fetchList(listId), fetchFolders()]);
			draftName = list.name;
			draftIcon = list.icon ?? 'formatListChecks';
			draftColor = list.color;
			draftFolderId = list.folderId;
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load list settings.';
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
		input: Partial<{
			name: string;
			color: string;
			icon: string | null;
			archived: boolean;
			badgeExcluded: boolean;
			useCategories: boolean;
			passcodeHash: string | null;
			folderId: number | null;
		}>
	) {
		try {
			list = await updateList(listId, input);
			void refreshBadgeCount();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update list.';
		}
	}

	// Name, icon, color, and folder all live in draft state and only reach the
	// server together, via one Save — unlike archive/badge/passcode, which
	// still apply immediately on click. The `: false` fallback is only
	// reachable while `list` is null, but this derived value is only ever
	// read inside the `{:else if list}` branch below — same unreachable-
	// fallback shape as `deleteConfirmMessage` further down this file.
	/* v8 ignore next */
	const hasChanges = $derived(
		list
			? draftName.trim() !== list.name ||
					draftIcon !== (list.icon ?? 'formatListChecks') ||
					draftColor !== list.color ||
					draftFolderId !== list.folderId
			: false
	);

	async function saveSettings(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = draftName.trim();
		if (!trimmed || !hasChanges) return;
		savingName = true;
		try {
			await onupdate({
				name: trimmed,
				icon: draftIcon,
				color: draftColor,
				folderId: draftFolderId
			});
		} finally {
			savingName = false;
		}
	}

	async function toggleArchived(current: ListDto) {
		await onupdate({ archived: !current.archived });
	}

	async function toggleBadgeExcluded(current: ListDto) {
		await onupdate({ badgeExcluded: !current.badgeExcluded });
	}

	async function toggleUseCategories(current: ListDto) {
		await onupdate({ useCategories: current.useCategories === false });
	}

	async function savePasscode(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = draftPin.trim();
		if (!trimmed) return;
		savingPasscode = true;
		try {
			await onupdate({ passcodeHash: await buildPasscodeHash(trimmed) });
			settingPasscode = false;
			draftPin = '';
		} finally {
			savingPasscode = false;
		}
	}

	async function removePasscode() {
		await onupdate({ passcodeHash: null });
	}

	// The `: ''` fallback is only reachable while `list` is null, but this
	// derived value is only ever rendered inside the `{:else if list}` branch
	// below — same unreachable-fallback shape as the `Reachable only once
	// loadAll's finally has run` comment further down this file.
	/* v8 ignore next */
	const deleteConfirmMessage = $derived(list ? `Delete "${list.name}"? This can't be undone.` : '');

	async function confirmDelete() {
		deleting = true;
		try {
			await deleteList(listId);
			await goto(resolve('/lists'));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to delete list.';
		} finally {
			deleting = false;
		}
	}
</script>

<main
	class="mx-auto flex max-w-lg flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title={list ? `${list.name} — Settings` : 'List settings'}
		backHref={resolve('/lists/[id]', { id: String(listId) })}
		backLabel="Back to list"
	/>

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if list}
		<nav class="flex flex-col gap-1">
			{#if list.useCategories !== false}
				<a
					href={resolve('/lists/[id]/categories', { id: String(listId) })}
					class="rounded-lg border border-gray-200 px-3 py-3 text-primary-700 hover:bg-gray-100 dark:border-gray-700 dark:text-primary-400 dark:hover:bg-gray-800"
				>
					Categories
				</a>
			{/if}
			<a
				href={resolve('/lists/[id]/members', { id: String(listId) })}
				class="rounded-lg border border-gray-200 px-3 py-3 text-primary-700 hover:bg-gray-100 dark:border-gray-700 dark:text-primary-400 dark:hover:bg-gray-800"
			>
				Members
			</a>
		</nav>

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		<form class="flex flex-col gap-3" onsubmit={saveSettings}>
			<span class="text-xs font-semibold text-gray-600 dark:text-gray-400">List settings</span>

			<div class="flex flex-col gap-1">
				<span class="text-xs text-gray-500 dark:text-gray-400">Name</span>
				<Input bind:value={draftName} />
			</div>

			<div class="flex gap-4">
				<div class="flex flex-col gap-1">
					<span class="text-xs text-gray-500 dark:text-gray-400">Icon</span>
					<IconPicker value={draftIcon} onselect={(icon) => (draftIcon = icon)} />
				</div>
				<div class="flex flex-col gap-1">
					<span class="text-xs text-gray-500 dark:text-gray-400">Color</span>
					<ColorPicker value={draftColor} onselect={(color) => (draftColor = color)} />
				</div>
			</div>

			{#if folders.length > 0}
				<div class="flex flex-col gap-1">
					<span class="text-xs text-gray-500 dark:text-gray-400">Folder</span>
					<Select
						size="sm"
						items={folders.map((folder) => ({ value: folder.id, name: folder.name }))}
						placeholder="No folder"
						clearable
						value={draftFolderId ?? ''}
						onchange={(event) => {
							const raw = (event.target as HTMLSelectElement).value;
							draftFolderId = raw === '' ? null : Number(raw);
						}}
					/>
				</div>
			{/if}

			<Button
				type="submit"
				class="w-full"
				disabled={savingName || !draftName.trim() || !hasChanges}
			>
				{savingName ? 'Saving…' : 'Save changes'}
			</Button>
		</form>

		<button
			type="button"
			class="rounded-lg border border-gray-200 px-3 py-3 text-left text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
			onclick={() => toggleBadgeExcluded(list!)}
		>
			{list.badgeExcluded ? 'Include in badge count' : 'Exclude from badge count'}
		</button>

		<button
			type="button"
			class="rounded-lg border border-gray-200 px-3 py-3 text-left text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
			onclick={() => toggleUseCategories(list!)}
		>
			{list.useCategories === false ? 'Enable categories' : 'Disable categories'}
		</button>

		{#if settingPasscode}
			<form class="flex flex-col gap-2" onsubmit={savePasscode}>
				<span class="text-xs font-semibold text-gray-600 dark:text-gray-400">
					{list.passcodeHash ? 'Change passcode' : 'Set passcode'}
				</span>
				<Input
					type="password"
					inputmode="numeric"
					autocomplete="off"
					placeholder="New passcode"
					bind:value={draftPin}
				/>
				<div class="flex items-center gap-2">
					<Button type="submit" size="sm" disabled={savingPasscode || !draftPin.trim()}>
						{savingPasscode ? 'Saving…' : 'Save passcode'}
					</Button>
					<Button
						type="button"
						size="sm"
						color="alternative"
						onclick={() => (settingPasscode = false)}
					>
						Cancel
					</Button>
				</div>
			</form>
		{:else}
			<button
				type="button"
				class="rounded-lg border border-gray-200 px-3 py-3 text-left text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
				onclick={() => (settingPasscode = true)}
			>
				{list.passcodeHash ? 'Change passcode…' : 'Set passcode…'}
			</button>
			{#if list.passcodeHash}
				<button
					type="button"
					class="rounded-lg border border-gray-200 px-3 py-3 text-left text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
					onclick={removePasscode}
				>
					Remove passcode
				</button>
			{/if}
		{/if}

		<hr class="border-gray-200 dark:border-gray-700" />

		<button
			type="button"
			class="rounded-lg border border-orange-200 px-3 py-3 text-left text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950"
			onclick={() => toggleArchived(list!)}
		>
			{list.archived ? 'Unarchive list' : 'Archive list'}
		</button>

		{#if confirmingDelete}
			<div class="flex flex-col gap-2 rounded-lg border border-red-200 p-3 dark:border-red-900">
				<p class="text-sm text-red-600 dark:text-red-400">{deleteConfirmMessage}</p>
				<div class="flex gap-2">
					<Button size="sm" color="red" disabled={deleting} onclick={confirmDelete}>
						{deleting ? 'Deleting…' : 'Confirm delete'}
					</Button>
					<Button size="sm" color="alternative" onclick={() => (confirmingDelete = false)}>
						Cancel
					</Button>
				</div>
			</div>
		{:else}
			<button
				type="button"
				class="rounded-lg border border-red-200 px-3 py-3 text-left text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
				onclick={() => (confirmingDelete = true)}
			>
				Delete list
			</button>
		{/if}
	{:else}
		<!-- Reachable only once loadAll's finally has run: loading is false, and
		     its catch always sets `error` when it leaves `list` unset. -->
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>
