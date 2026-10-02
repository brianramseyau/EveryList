<script lang="ts">
	import { onMount } from 'svelte';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from 'flowbite-svelte';
	import type { BackupFileDto, BackupFrequency, BackupSettingsDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import {
		deleteBackup,
		downloadBackup,
		fetchBackupState,
		runBackupNow,
		updateBackupSettings
	} from '$lib/api/backups';
	import { formatFileSize } from '$lib/api/format-file-size';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Loader from '$lib/components/Loader.svelte';

	let loading = $state(true);
	let error = $state<string | null>(null);
	let files = $state<BackupFileDto[]>([]);

	let frequency = $state<BackupFrequency>('weekly');
	let timeOfDay = $state('03:00');
	let retentionCount = $state(4);
	let saving = $state(false);

	let runningNow = $state(false);
	let downloadingFilename = $state<string | null>(null);
	let confirmingDeleteFilename = $state<string | null>(null);
	let deletingFilename = $state<string | null>(null);

	// Driven by the file list (the actual most recent backup, automatic or
	// manual) — there's no separate "last backup" field on the server to read
	// instead, since automatic and manual backups are tracked independently.
	const lastBackupLabel = $derived(
		files[0] ? `Last backup: ${formatTimestamp(files[0].createdAt)}` : 'No backup has run yet.'
	);

	function applySettings(next: BackupSettingsDto) {
		frequency = next.frequency;
		timeOfDay = next.timeOfDay;
		retentionCount = next.retentionCount;
	}

	function formatTimestamp(value: string): string {
		return new Date(value).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}

	async function loadAll() {
		loading = true;
		try {
			const state = await fetchBackupState();
			applySettings(state.settings);
			files = state.files;
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load backup settings.';
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

	async function handleSave(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		try {
			const state = await updateBackupSettings(frequency, timeOfDay, retentionCount);
			applySettings(state.settings);
			files = state.files;
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to save backup settings.';
		} finally {
			saving = false;
		}
	}

	async function handleRunNow() {
		runningNow = true;
		try {
			const state = await runBackupNow();
			applySettings(state.settings);
			files = state.files;
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to run a backup.';
		} finally {
			runningNow = false;
		}
	}

	async function handleDownload(filename: string) {
		downloadingFilename = filename;
		try {
			await downloadBackup(filename);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : `Failed to download ${filename}.`;
		} finally {
			downloadingFilename = null;
		}
	}

	// The row's single red button both opens the confirmation and, once open,
	// carries it out — keeping one DOM element means focus never moves as the
	// label changes, so a keyboard user doesn't lose their place.
	function handleDeleteClick(filename: string) {
		if (confirmingDeleteFilename === filename) {
			void handleDelete(filename);
		} else {
			confirmingDeleteFilename = filename;
		}
	}

	// Never called concurrently: every Delete/Cancel button is disabled while a
	// delete is in flight (see the buttons below), so a simple clear of the
	// shared state is safe.
	async function handleDelete(filename: string) {
		deletingFilename = filename;
		try {
			// Only the file list is applied — the returned settings would
			// otherwise overwrite an unsaved schedule the admin is editing.
			const state = await deleteBackup(filename);
			files = state.files;
			confirmingDeleteFilename = null;
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : `Failed to delete ${filename}.`;
		} finally {
			deletingFilename = null;
		}
	}
</script>

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="Backups" backHref={resolve('/settings')} />

	<p class="text-sm text-gray-600 dark:text-gray-400">
		Automatically backs up the database using SQLite's own online backup API, so it's safe to run
		while the app is in use. One schedule applies to the whole instance.
	</p>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loading}
		<Loader />
	{:else}
		<form class="flex flex-col gap-3" onsubmit={handleSave}>
			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium">Frequency</span>
				<select
					aria-label="Frequency"
					class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
					bind:value={frequency}
				>
					<option value="daily">Daily</option>
					<option value="weekly">Weekly (Sunday)</option>
					<option value="monthly">Monthly (1st)</option>
				</select>
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium">Time of day</span>
				<input
					type="time"
					aria-label="Time of day"
					class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
					bind:value={timeOfDay}
				/>
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium">Backups to keep</span>
				<input
					type="number"
					min="1"
					max="60"
					aria-label="Backups to keep"
					class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
					bind:value={retentionCount}
				/>
				<span class="text-xs text-gray-500 dark:text-gray-400">
					Applies separately to automatic and manual backups — e.g. 4 keeps the last 4 of each.
				</span>
			</label>

			<Button type="submit" size="sm" disabled={saving || deletingFilename !== null}>
				{saving ? 'Saving…' : 'Save schedule'}
			</Button>
		</form>

		<section class="flex flex-col gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold">Backup files</h2>
				<Button
					type="button"
					size="sm"
					color="alternative"
					onclick={handleRunNow}
					disabled={runningNow || deletingFilename !== null}
				>
					{runningNow ? 'Backing up…' : 'Back up now'}
				</Button>
			</div>

			<p class="text-xs text-gray-500 dark:text-gray-400">{lastBackupLabel}</p>

			{#if files.length === 0}
				<p class="text-sm text-gray-600 dark:text-gray-400">No backup files yet.</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each files as file (file.filename)}
						<li
							class="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700"
						>
							<div class="flex items-start gap-2">
								<span
									class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase {file.kind ===
									'automatic'
										? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
										: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}"
								>
									{file.kind}
								</span>
								<span class="min-w-0 font-medium break-all">{file.filename}</span>
							</div>

							<p class="text-xs text-gray-500 dark:text-gray-400">
								{formatFileSize(file.sizeBytes)} · {formatTimestamp(file.createdAt)}
							</p>

							{#if confirmingDeleteFilename === file.filename}
								<p
									class="border-t border-gray-200 pt-2 text-xs text-red-600 dark:border-gray-700 dark:text-red-400"
								>
									Delete this backup? This can't be undone.
								</p>
							{/if}

							<div class="flex flex-wrap gap-2">
								<Button
									type="button"
									size="xs"
									color="alternative"
									onclick={() => handleDownload(file.filename)}
									disabled={downloadingFilename === file.filename}
								>
									{downloadingFilename === file.filename ? 'Downloading…' : 'Download'}
								</Button>
								<Button
									type="button"
									size="xs"
									color="red"
									disabled={deletingFilename !== null || runningNow || saving}
									onclick={() => handleDeleteClick(file.filename)}
								>
									{deletingFilename === file.filename
										? 'Deleting…'
										: confirmingDeleteFilename === file.filename
											? 'Confirm delete'
											: 'Delete'}
								</Button>
								{#if confirmingDeleteFilename === file.filename}
									<Button
										type="button"
										size="xs"
										color="alternative"
										disabled={deletingFilename !== null}
										onclick={() => (confirmingDeleteFilename = null)}
									>
										Cancel
									</Button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>
