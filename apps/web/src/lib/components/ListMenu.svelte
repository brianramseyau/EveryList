<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, Input } from 'flowbite-svelte';
	import type { ListDto } from '@everylist/shared';
	import { emailExportList } from '$lib/api/lists';
	import { ApiError } from '$lib/api/client';
	import { buildPasscodeHash } from '$lib/passcode';
	import Icon from './Icon.svelte';
	import IconPicker from './IconPicker.svelte';
	import ColorPicker from './ColorPicker.svelte';

	let {
		listId,
		list,
		onupdate,
		ondelete
	}: {
		listId: number;
		list: ListDto | null;
		onupdate: (
			input: Partial<{
				name: string;
				color: string;
				icon: string | null;
				archived: boolean;
				badgeExcluded: boolean;
				passcodeHash: string | null;
			}>
		) => Promise<void>;
		ondelete: () => Promise<void>;
	} = $props();

	let open = $state(false);
	let draftName = $state('');
	let savingName = $state(false);
	let confirmingDelete = $state(false);
	let deleting = $state(false);
	let exportingEmail = $state(false);
	let exportEmail = $state('');
	let exportStatus = $state<'idle' | 'sent' | 'error'>('idle');
	let exportErrorMessage = $state('');
	let settingPasscode = $state(false);
	let draftPin = $state('');
	let savingPasscode = $state(false);

	function toggle() {
		open = !open;
		if (open) {
			draftName = list?.name ?? '';
			confirmingDelete = false;
			exportingEmail = false;
			exportStatus = 'idle';
			settingPasscode = false;
			draftPin = '';
		}
	}

	function printList() {
		window.print();
	}

	async function sendEmailExport(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = exportEmail.trim();
		if (!trimmed) return;
		exportStatus = 'idle';
		try {
			await emailExportList(listId, trimmed);
			exportStatus = 'sent';
			exportEmail = '';
		} catch (err) {
			exportStatus = 'error';
			exportErrorMessage = err instanceof ApiError ? err.message : 'Failed to send export.';
		}
	}

	async function saveName(event: SubmitEvent, current: ListDto) {
		event.preventDefault();
		const trimmed = draftName.trim();
		if (!trimmed || trimmed === current.name) return;
		savingName = true;
		try {
			await onupdate({ name: trimmed });
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

	const deleteConfirmMessage = $derived(list ? `Delete "${list.name}"? This can't be undone.` : '');

	async function confirmDelete() {
		deleting = true;
		try {
			await ondelete();
		} finally {
			deleting = false;
		}
	}
</script>

<div class="relative">
	<button
		type="button"
		onclick={toggle}
		aria-label="List settings"
		aria-expanded={open}
		class="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
	>
		<Icon name="cog" class="h-5 w-5" />
	</button>

	{#if open}
		<div
			class="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800"
		>
			<a
				href={resolve('/lists/[id]/categories', { id: String(listId) })}
				class="block rounded px-2 py-1.5 text-sm text-primary-700 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
			>
				Categories
			</a>
			<a
				href={resolve('/lists/[id]/members', { id: String(listId) })}
				class="block rounded px-2 py-1.5 text-sm text-primary-700 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
			>
				Members
			</a>

			{#if list}
				<hr class="my-2 border-gray-200 dark:border-gray-700" />

				<form class="flex flex-col gap-2 px-2 py-1.5" onsubmit={(event) => saveName(event, list)}>
					<span class="text-xs font-semibold text-gray-600 dark:text-gray-400">List settings</span>
					<Input bind:value={draftName} />
					<div class="flex items-center gap-2">
						<IconPicker
							value={list.icon ?? 'formatListChecks'}
							onselect={(icon) => onupdate({ icon })}
						/>
						<ColorPicker value={list.color} onselect={(color) => onupdate({ color })} />
					</div>
					<Button
						type="submit"
						size="xs"
						disabled={savingName || !draftName.trim() || draftName.trim() === list.name}
					>
						{savingName ? 'Saving…' : 'Save name'}
					</Button>
				</form>

				<button
					type="button"
					class="block w-full rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
					onclick={() => toggleArchived(list)}
				>
					{list.archived ? 'Unarchive list' : 'Archive list'}
				</button>

				<button
					type="button"
					class="block w-full rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
					onclick={() => toggleBadgeExcluded(list)}
				>
					{list.badgeExcluded ? 'Include in badge count' : 'Exclude from badge count'}
				</button>

				{#if settingPasscode}
					<form class="flex flex-col gap-2 px-2 py-1.5" onsubmit={savePasscode}>
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
							<Button type="submit" size="xs" disabled={savingPasscode || !draftPin.trim()}>
								{savingPasscode ? 'Saving…' : 'Save passcode'}
							</Button>
							<Button
								type="button"
								size="xs"
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
						class="block w-full rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
						onclick={() => (settingPasscode = true)}
					>
						{list.passcodeHash ? 'Change passcode…' : 'Set passcode…'}
					</button>
					{#if list.passcodeHash}
						<button
							type="button"
							class="block w-full rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
							onclick={removePasscode}
						>
							Remove passcode
						</button>
					{/if}
				{/if}

				<hr class="my-2 border-gray-200 dark:border-gray-700" />

				<button
					type="button"
					class="block w-full rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
					onclick={printList}
				>
					Print list
				</button>

				{#if exportingEmail}
					<form class="flex flex-col gap-2 px-2 py-1.5" onsubmit={sendEmailExport}>
						<span class="text-xs font-semibold text-gray-600 dark:text-gray-400">
							Email export
						</span>
						<Input type="email" placeholder="you@example.com" bind:value={exportEmail} required />
						<div class="flex items-center gap-2">
							<Button type="submit" size="xs" disabled={!exportEmail.trim()}>Send</Button>
							<Button
								type="button"
								size="xs"
								color="alternative"
								onclick={() => (exportingEmail = false)}
							>
								Cancel
							</Button>
						</div>
						{#if exportStatus === 'sent'}
							<p class="text-xs text-green-600 dark:text-green-400">Export sent.</p>
						{:else if exportStatus === 'error'}
							<p class="text-xs text-red-600 dark:text-red-400">{exportErrorMessage}</p>
						{/if}
					</form>
				{:else}
					<button
						type="button"
						class="block w-full rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
						onclick={() => (exportingEmail = true)}
					>
						Email export…
					</button>
				{/if}

				{#if confirmingDelete}
					<div
						class="mt-1 flex flex-col gap-2 rounded-lg border border-red-200 p-2 dark:border-red-900"
					>
						<p class="text-xs text-red-600 dark:text-red-400">{deleteConfirmMessage}</p>
						<div class="flex gap-2">
							<Button size="xs" color="red" disabled={deleting} onclick={confirmDelete}>
								{deleting ? 'Deleting…' : 'Confirm delete'}
							</Button>
							<Button size="xs" color="alternative" onclick={() => (confirmingDelete = false)}>
								Cancel
							</Button>
						</div>
					</div>
				{:else}
					<button
						type="button"
						class="mt-1 block w-full rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
						onclick={() => (confirmingDelete = true)}
					>
						Delete list
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</div>
