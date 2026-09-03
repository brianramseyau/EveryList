<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Input, Select, Toggle } from 'flowbite-svelte';
	import type { FolderDto, ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { deleteList, fetchList, updateList } from '$lib/api/lists';
	import { fetchFolders } from '$lib/api/folders';
	import { ApiError } from '$lib/api/client';
	import { buildPasscodeHash } from '$lib/passcode';
	import { refreshBadgeCount } from '$lib/pwa/badge';
	import { consumeListOrigin } from '$lib/nav-direction';
	import IconPicker from '$lib/components/IconPicker.svelte';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Loader from '$lib/components/Loader.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let folders = $state<FolderDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let draftName = $state('');
	let draftIcon = $state('formatListChecks');
	let draftColor = $state('#3b82f6');
	let draftFolderId = $state<number | null>(null);
	// The open-item limit's input draft — kept as text so "empty = no limit" is a
	// first-class state rather than a magic number; applied on blur (see applyLimitDraft).
	let draftLimitText = $state('');
	let savingName = $state(false);
	let confirmingCategoryLearningOff = $state(false);
	let confirmingDelete = $state(false);
	let deleting = $state(false);
	let settingPasscode = $state(false);
	let draftPin = $state('');
	let savingPasscode = $state(false);
	// See items/[itemId]/+page.svelte's `cameFromList` — same rationale, used
	// by the header back arrow below to prefer a real `history.back()`.
	let cameFromList = false;

	async function loadAll() {
		loading = true;
		try {
			[list, folders] = await Promise.all([fetchList(listId), fetchFolders()]);
			// Every control on this page mutates the list — nothing here is readable-only, so a
			// viewer landing here (via a stale link, browser history, or typing the URL) has
			// nothing to do but bounce back. The menu entry that links here is also hidden/disabled
			// for viewers; this is the defense-in-depth backstop for direct navigation.
			if (list.role === 'viewer') {
				await goto(resolve('/lists/[id]', { id: String(listId) }));
				return;
			}
			draftName = list.name;
			draftIcon = list.icon ?? 'formatListChecks';
			draftColor = list.color;
			draftFolderId = list.folderId;
			draftLimitText = list.maxUncheckedItems != null ? String(list.maxUncheckedItems) : '';
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
		cameFromList = consumeListOrigin();
		void loadAll();
	});

	async function returnToList() {
		if (cameFromList) {
			window.history.back();
			return;
		}
		await goto(resolve('/lists/[id]', { id: String(listId) }));
	}

	async function onupdate(
		input: Partial<{
			name: string;
			color: string;
			icon: string | null;
			archived: boolean;
			badgeExcluded: boolean;
			useCategories: boolean;
			useCategoryLearning: boolean;
			useShops: boolean;
			useFavorites: boolean;
			useRecent: boolean;
			useQuantity: boolean;
			usePrice: boolean;
			showStoreInList: boolean;
			showPriceInList: boolean;
			itemSortOrder: 'ranked' | 'alphabetical';
			insertPosition: 'top' | 'bottom';
			maxUncheckedItems: number | null;
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

	// Empty text = no limit (null); anything else must be a whole number 1–999
	// (the validator's range — reverting the draft beats a 422 round trip). Saving
	// a lower limit than the current open count is allowed on purpose: the limit
	// gates intake, it isn't a maintained invariant (PLAN_25).
	async function applyLimitDraft() {
		if (!list) return;
		const trimmed = draftLimitText.trim();
		const next = trimmed === '' ? null : Number(trimmed);
		if (next !== null && (!Number.isInteger(next) || next < 1 || next > 999)) {
			draftLimitText = list.maxUncheckedItems != null ? String(list.maxUncheckedItems) : '';
			return;
		}
		if (next === (list.maxUncheckedItems ?? null)) return;
		await onupdate({ maxUncheckedItems: next });
	}

	const limitHelperText = $derived(
		list?.maxUncheckedItems != null
			? `At most ${list.maxUncheckedItems} unchecked item${list.maxUncheckedItems === 1 ? '' : 's'} at a time — ${list.itemCount} open now.`
			: `No cap — ${list?.itemCount ?? 0} unchecked item${(list?.itemCount ?? 0) === 1 ? '' : 's'} now.`
	);

	type BooleanFeatureField =
		| 'useCategories'
		| 'useCategoryLearning'
		| 'useShops'
		| 'useFavorites'
		| 'useRecent'
		| 'useQuantity'
		| 'usePrice'
		| 'showStoreInList'
		| 'showPriceInList';

	// Every feature toggle defaults to `true` server-side — `!== false` is the
	// standard "missing/undefined means on" read used across this page (see
	// ListDto's field comments).
	async function toggleFeature(field: BooleanFeatureField, current: ListDto) {
		await onupdate({ [field]: current[field] === false });
	}

	// Turning this off makes the server permanently delete everything it's
	// learned for this list (see lists_controller.ts), so unlike the other
	// feature toggles above, turning it off goes through a confirm step;
	// turning it back on is harmless and applies immediately.
	function handleCategoryLearningToggle(current: ListDto) {
		if (current.useCategoryLearning !== false) {
			confirmingCategoryLearningOff = true;
		} else {
			void toggleFeature('useCategoryLearning', current);
		}
	}

	async function confirmCategoryLearningOff() {
		await toggleFeature('useCategoryLearning', list!);
		confirmingCategoryLearningOff = false;
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
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title={list ? 'Settings' : 'List settings'}
		subtitle={list?.name}
		htmlTitle={list ? `${list.name} — Settings` : 'List settings'}
		backHref={resolve('/lists/[id]', { id: String(listId) })}
		backLabel="Back to list"
		onBack={returnToList}
	/>

	{#if loading}
		<Loader />
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
			<h2 class="text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
				List settings
			</h2>

			<div class="flex flex-col gap-1">
				<span class="text-xs text-gray-500 dark:text-gray-400">Name</span>
				<Input bind:value={draftName} />
			</div>

			<div class="flex gap-4">
				<div class="flex flex-col gap-1">
					<span class="text-xs text-gray-500 dark:text-gray-400">Icon</span>
					<IconPicker value={draftIcon} onselect={(icon) => (draftIcon = icon)} hint={draftName} />
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
						aria-label="Folder"
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

		<div class="flex flex-col gap-2">
			<h2 class="text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
				Features
			</h2>

			<Toggle
				checked={list.useCategories !== false}
				onchange={() => toggleFeature('useCategories', list!)}
				class="w-full flex-row-reverse items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-gray-700 dark:border-gray-700 dark:text-gray-200"
			>
				Categories
			</Toggle>

			{#if list.useCategories !== false}
				{#if confirmingCategoryLearningOff}
					<div
						class="ml-4 flex flex-col gap-2 rounded-lg border border-red-200 p-3 dark:border-red-900"
					>
						<p class="text-sm text-red-600 dark:text-red-400">
							Turning this off deletes everything this list has learned about item categories. This
							can't be undone.
						</p>
						<div class="flex gap-2">
							<Button size="sm" color="red" onclick={confirmCategoryLearningOff}>
								Confirm turn off
							</Button>
							<Button
								size="sm"
								color="alternative"
								onclick={() => (confirmingCategoryLearningOff = false)}
							>
								Cancel
							</Button>
						</div>
					</div>
				{:else}
					<Toggle
						checked={list.useCategoryLearning !== false}
						onchange={() => handleCategoryLearningToggle(list!)}
						class="ml-4 w-full flex-row-reverse items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-gray-700 dark:border-gray-700 dark:text-gray-200"
					>
						Learn item categories
					</Toggle>
				{/if}
			{/if}

			<Toggle
				checked={list.useShops !== false}
				onchange={() => toggleFeature('useShops', list!)}
				class="w-full flex-row-reverse items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-gray-700 dark:border-gray-700 dark:text-gray-200"
			>
				Stores
			</Toggle>

			{#if list.useShops !== false}
				<Toggle
					checked={list.showStoreInList !== false}
					onchange={() => toggleFeature('showStoreInList', list!)}
					class="ml-4 w-full flex-row-reverse items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-gray-700 dark:border-gray-700 dark:text-gray-200"
				>
					Show store name in list
				</Toggle>
			{/if}

			<Toggle
				checked={list.useFavorites !== false}
				onchange={() => toggleFeature('useFavorites', list!)}
				class="w-full flex-row-reverse items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-gray-700 dark:border-gray-700 dark:text-gray-200"
			>
				Favorites
			</Toggle>

			<Toggle
				checked={list.useRecent !== false}
				onchange={() => toggleFeature('useRecent', list!)}
				class="w-full flex-row-reverse items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-gray-700 dark:border-gray-700 dark:text-gray-200"
			>
				Recently deleted
			</Toggle>

			<Toggle
				checked={list.useQuantity !== false}
				onchange={() => toggleFeature('useQuantity', list!)}
				class="w-full flex-row-reverse items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-gray-700 dark:border-gray-700 dark:text-gray-200"
			>
				Quantity
			</Toggle>

			<Toggle
				checked={list.usePrice !== false}
				onchange={() => toggleFeature('usePrice', list!)}
				class="w-full flex-row-reverse items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-gray-700 dark:border-gray-700 dark:text-gray-200"
			>
				Price
			</Toggle>

			{#if list.usePrice !== false}
				<Toggle
					checked={list.showPriceInList !== false}
					onchange={() => toggleFeature('showPriceInList', list!)}
					class="ml-4 w-full flex-row-reverse items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-gray-700 dark:border-gray-700 dark:text-gray-200"
				>
					Show price in list
				</Toggle>
			{/if}
		</div>

		<div class="flex flex-col gap-1">
			<span class="text-xs text-gray-500 dark:text-gray-400">Open item limit</span>
			<Input
				aria-label="Open item limit"
				type="number"
				min={1}
				max={999}
				size="sm"
				placeholder="No limit"
				bind:value={draftLimitText}
				onblur={applyLimitDraft}
			/>
			<span class="text-xs text-gray-500 dark:text-gray-400">{limitHelperText}</span>
			<span class="text-xs text-gray-500 dark:text-gray-400">
				Leave empty for no limit. Checking an item off frees a slot; adding is blocked while the
				list is full.
			</span>
		</div>

		<div class="flex flex-col gap-1">
			<span class="text-xs text-gray-500 dark:text-gray-400">Item Sort Order</span>
			<Select
				aria-label="Item Sort Order"
				size="sm"
				items={[
					{ value: 'ranked', name: 'Ranked' },
					{ value: 'alphabetical', name: 'Alphabetical' }
				]}
				value={list.itemSortOrder ?? 'ranked'}
				onchange={(event) => {
					const value = (event.target as HTMLSelectElement).value as 'ranked' | 'alphabetical';
					void onupdate({ itemSortOrder: value });
				}}
			/>
		</div>

		{#if (list.itemSortOrder ?? 'ranked') !== 'alphabetical'}
			<div class="flex flex-col gap-1">
				<span class="text-xs text-gray-500 dark:text-gray-400">Insert new items</span>
				<Select
					aria-label="Insert new items"
					size="sm"
					items={[
						{ value: 'bottom', name: 'At bottom' },
						{ value: 'top', name: 'At top' }
					]}
					value={list.insertPosition ?? 'bottom'}
					onchange={(event) => {
						const value = (event.target as HTMLSelectElement).value as 'top' | 'bottom';
						void onupdate({ insertPosition: value });
					}}
				/>
			</div>
		{/if}

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
