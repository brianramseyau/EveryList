<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { AdminUserDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import {
		createAdminUser,
		deleteAdminUser,
		fetchAdminUsers,
		updateAdminUser
	} from '$lib/api/admin-users';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Icon from '$lib/components/Icon.svelte';

	// This whole page 403s server-side for anyone but user id 1 (see admin_users_controller.ts),
	// so successfully loading it already proves "I am id 1" — no need for a second fetchProfile()
	// round trip (whose failure would otherwise have to be handled) just to know which row is "me".
	const CURRENT_USER_ID = 1;

	let users = $state<AdminUserDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let creating = $state(false);
	let createFullName = $state('');
	let createEmail = $state('');
	let createPassword = $state('');
	let createDefaultLists = $state(true);
	let createError = $state<string | null>(null);
	let createBusy = $state(false);

	let editingId = $state<number | null>(null);
	let editFullName = $state('');
	let editEmail = $state('');
	let editPassword = $state('');
	let editError = $state<string | null>(null);
	let editBusy = $state(false);

	let confirmingDeleteId = $state<number | null>(null);
	let rowBusyId = $state<number | null>(null);

	function displayName(user: AdminUserDto): string {
		return user.fullName ?? user.email;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	async function load() {
		loading = true;
		try {
			users = await fetchAdminUsers();
			error = null;
		} catch (err) {
			if (err instanceof ApiError && err.status === 403) {
				error = "This page is only available to the instance's primary account.";
			} else {
				error = err instanceof ApiError ? err.message : 'Failed to load users.';
			}
		} finally {
			loading = false;
		}
	}

	function startCreate() {
		creating = true;
		createFullName = '';
		createEmail = '';
		createPassword = '';
		createDefaultLists = true;
		createError = null;
	}

	function cancelCreate() {
		creating = false;
		createError = null;
	}

	async function submitCreate() {
		createBusy = true;
		createError = null;
		try {
			const created = await createAdminUser({
				fullName: createFullName.trim().length > 0 ? createFullName.trim() : null,
				email: createEmail.trim(),
				password: createPassword,
				createDefaultLists
			});
			users = [...users, created];
			creating = false;
		} catch (err) {
			createError = err instanceof ApiError ? err.message : 'Failed to create user.';
		} finally {
			createBusy = false;
		}
	}

	function startEdit(user: AdminUserDto) {
		editingId = user.id;
		editFullName = user.fullName ?? '';
		editEmail = user.email;
		editPassword = '';
		editError = null;
	}

	function cancelEdit() {
		editingId = null;
		editError = null;
	}

	async function submitEdit(user: AdminUserDto) {
		editBusy = true;
		editError = null;
		try {
			const body: Parameters<typeof updateAdminUser>[1] = {
				fullName: editFullName.trim().length > 0 ? editFullName.trim() : null,
				email: editEmail.trim()
			};
			if (editPassword.length > 0) body.password = editPassword;

			const updated = await updateAdminUser(user.id, body);
			users = users.map((u) => (u.id === updated.id ? updated : u));
			editingId = null;
		} catch (err) {
			editError = err instanceof ApiError ? err.message : 'Failed to update user.';
		} finally {
			editBusy = false;
		}
	}

	async function toggleDisabled(user: AdminUserDto) {
		rowBusyId = user.id;
		try {
			const updated = await updateAdminUser(user.id, { disabled: user.disabledAt === null });
			users = users.map((u) => (u.id === updated.id ? updated : u));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update user.';
		} finally {
			rowBusyId = null;
		}
	}

	async function confirmDelete(user: AdminUserDto) {
		rowBusyId = user.id;
		try {
			await deleteAdminUser(user.id);
			users = users.filter((u) => u.id !== user.id);
			confirmingDeleteId = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to delete user.';
		} finally {
			rowBusyId = null;
		}
	}

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
			return;
		}
		void load();
	});
</script>

<main
	class="mx-auto flex max-w-2xl flex-col gap-6 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="Manage users" backHref={resolve('/settings')} />

	{#if loading}
		<p class="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
	{:else if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if !loading && !error}
		<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
			{#each users as user (user.id)}
				<div class="border-b border-gray-200 last:border-b-0 dark:border-gray-700">
					{#if editingId === user.id}
						<div class="flex flex-col gap-2 px-4 py-3">
							<input
								type="text"
								placeholder="Full name"
								bind:value={editFullName}
								class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
							/>
							<input
								type="email"
								placeholder="Email"
								bind:value={editEmail}
								class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
							/>
							<input
								type="password"
								placeholder="New password (leave blank to keep current)"
								bind:value={editPassword}
								class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
							/>
							{#if editError}
								<p class="text-sm text-red-600 dark:text-red-400">{editError}</p>
							{/if}
							<div class="flex justify-end gap-2">
								<button
									type="button"
									onclick={cancelEdit}
									disabled={editBusy}
									class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
								>
									Cancel
								</button>
								<button
									type="button"
									onclick={() => submitEdit(user)}
									disabled={editBusy}
									class="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
								>
									Save
								</button>
							</div>
						</div>
					{:else}
						<div class="flex items-center justify-between gap-3 px-4 py-3">
							<div class="min-w-0">
								<p class="truncate text-sm font-medium">
									{displayName(user)}
									{#if user.id === CURRENT_USER_ID}
										<span class="text-xs text-gray-400">(you)</span>
									{/if}
								</p>
								<p class="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
								<p class="text-xs text-gray-400 dark:text-gray-500">
									Joined {formatDate(user.createdAt)}
									{#if user.disabledAt}
										· <span class="text-red-600 dark:text-red-400">Disabled</span>
									{/if}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								<button
									type="button"
									onclick={() => startEdit(user)}
									aria-label="Edit"
									class="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
								>
									<Icon name="pencil" class="h-4 w-4" />
								</button>
								{#if user.id !== CURRENT_USER_ID}
									<button
										type="button"
										onclick={() => toggleDisabled(user)}
										disabled={rowBusyId === user.id}
										aria-label={user.disabledAt ? 'Enable' : 'Disable'}
										class="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800"
									>
										<Icon name="lock" class="h-4 w-4" />
									</button>
									{#if confirmingDeleteId === user.id}
										<button
											type="button"
											onclick={() => confirmDelete(user)}
											disabled={rowBusyId === user.id}
											class="rounded-lg bg-red-600 px-2 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
										>
											Confirm delete
										</button>
										<button
											type="button"
											onclick={() => (confirmingDeleteId = null)}
											class="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
										>
											Cancel
										</button>
									{:else}
										<button
											type="button"
											onclick={() => (confirmingDeleteId = user.id)}
											aria-label="Delete"
											class="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
										>
											<Icon name="trashCanOutline" class="h-4 w-4" />
										</button>
									{/if}
								{/if}
							</div>
						</div>
						{#if confirmingDeleteId === user.id}
							<p class="px-4 pb-3 text-xs text-red-600 dark:text-red-400">
								Deletes this user and every list they own, including all items in those lists. This
								can't be undone.
							</p>
						{/if}
					{/if}
				</div>
			{/each}

			{#if creating}
				<div class="flex flex-col gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
					<input
						type="text"
						placeholder="Full name (optional)"
						bind:value={createFullName}
						class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
					/>
					<input
						type="email"
						placeholder="Email"
						bind:value={createEmail}
						class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
					/>
					<input
						type="password"
						placeholder="Password (8-32 characters)"
						bind:value={createPassword}
						class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
					/>
					<label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
						<input
							type="checkbox"
							bind:checked={createDefaultLists}
							class="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
						/>
						Create default lists (Todos, Shopping List)
					</label>
					{#if createError}
						<p class="text-sm text-red-600 dark:text-red-400">{createError}</p>
					{/if}
					<div class="flex justify-end gap-2">
						<button
							type="button"
							onclick={cancelCreate}
							disabled={createBusy}
							class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
						>
							Cancel
						</button>
						<button
							type="button"
							onclick={submitCreate}
							disabled={createBusy || !createEmail || createPassword.length < 8}
							class="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
						>
							Add user
						</button>
					</div>
				</div>
			{:else}
				<button
					type="button"
					onclick={startCreate}
					class="flex w-full items-center justify-center gap-2 border-t border-gray-200 px-4 py-3 text-sm font-medium text-primary-600 hover:bg-gray-50 dark:border-gray-700 dark:text-primary-400 dark:hover:bg-gray-800"
				>
					<Icon name="plus" class="h-4 w-4" />
					Add user
				</button>
			{/if}
		</section>
	{/if}
</main>
