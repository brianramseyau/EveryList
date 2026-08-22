<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from 'flowbite-svelte';
	import type { BackupFileDto, BackupFrequency, BackupSettingsDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchBackupState, runBackupNow, updateBackupSettings } from '$lib/api/backups';
	import { formatFileSize } from '$lib/api/format-file-size';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let loading = $state(true);
	let error = $state<string | null>(null);
	let files = $state<BackupFileDto[]>([]);

	let frequency = $state<BackupFrequency>('weekly');
	let timeOfDay = $state('03:00');
	let retentionCount = $state(4);
	let saving = $state(false);

	let runningNow = $state(false);

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
</script>

<svelte:head>
	<title>Backups — EveryList</title>
</svelte:head>

<main
	class="mx-auto flex max-w-lg flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
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
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
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

			<Button type="submit" size="sm" disabled={saving}>
				{saving ? 'Saving…' : 'Save schedule'}
			</Button>
		</form>

		<section class="flex flex-col gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold">Backup files</h2>
				<Button
					type="button"
					size="sm"
					color="alternative"
					onclick={handleRunNow}
					disabled={runningNow}
				>
					{runningNow ? 'Backing up…' : 'Back up now'}
				</Button>
			</div>

			<p class="text-xs text-gray-500 dark:text-gray-400">{lastBackupLabel}</p>

			{#if files.length === 0}
				<p class="text-sm text-gray-600 dark:text-gray-400">No backup files yet.</p>
			{:else}
				<ul class="flex flex-col gap-1">
					{#each files as file (file.filename)}
						<li
							class="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
						>
							<div class="flex min-w-0 items-center gap-2">
								<span
									class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase {file.kind ===
									'automatic'
										? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
										: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}"
								>
									{file.kind}
								</span>
								<span class="truncate">{file.filename}</span>
							</div>
							<span class="shrink-0 text-xs text-gray-500 dark:text-gray-400">
								{formatFileSize(file.sizeBytes)} · {formatTimestamp(file.createdAt)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>
