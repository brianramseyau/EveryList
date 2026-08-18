<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from 'flowbite-svelte';
	import type {
		ListDto,
		ListInviteDto,
		ListMemberDto,
		ListRole,
		MemberCandidateDto
	} from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchProfile } from '$lib/api/auth';
	import { fetchList } from '$lib/api/lists';
	import {
		addMember,
		fetchMemberCandidates,
		fetchMembers,
		removeMember,
		updateMemberRole
	} from '$lib/api/members';
	import { createInvite, fetchInvites, revokeInvite } from '$lib/api/invites';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let members = $state<ListMemberDto[]>([]);
	let invites = $state<ListInviteDto[]>([]);
	let candidates = $state<MemberCandidateDto[]>([]);
	let currentUserId = $state<number | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newInviteRole = $state<Exclude<ListRole, 'owner'>>('editor');
	let creatingInvite = $state(false);
	let lastCreatedToken = $state<string | null>(null);

	let newMemberRole = $state<Exclude<ListRole, 'owner'>>('editor');
	let addingMember = $state(false);
	const isOwner = $derived(
		members.find((member) => member.userId === currentUserId)?.role === 'owner'
	);

	function joinUrl(token: string): string {
		return `${window.location.origin}${resolve('/join/[token]', { token })}`;
	}

	async function loadAll() {
		loading = true;
		try {
			const profile = await fetchProfile();
			currentUserId = profile.id;
			[list, members, invites] = await Promise.all([
				fetchList(listId),
				fetchMembers(listId),
				fetchInvites(listId)
			]);
			candidates = await fetchMemberCandidates(listId);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load members.';
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

	async function handleRoleChange(member: ListMemberDto, role: Exclude<ListRole, 'owner'>) {
		try {
			const updated = await updateMemberRole(listId, member.id, role);
			members = members.map((current) => (current.id === member.id ? updated : current));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update member role.';
		}
	}

	async function handleRemove(member: ListMemberDto) {
		try {
			await removeMember(listId, member.id);
			members = members.filter((current) => current.id !== member.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to remove member.';
		}
	}

	async function handleAddMember(candidate: MemberCandidateDto) {
		addingMember = true;
		try {
			const member = await addMember(listId, candidate.user.id, newMemberRole);
			members = [...members, member];
			candidates = candidates.filter((current) => current.user.id !== candidate.user.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to add member.';
		} finally {
			addingMember = false;
		}
	}

	async function handleCreateInvite(event: SubmitEvent) {
		event.preventDefault();
		creatingInvite = true;
		try {
			const invite = await createInvite(listId, newInviteRole);
			invites = [invite, ...invites];
			lastCreatedToken = invite.token;
			try {
				await navigator.clipboard.writeText(joinUrl(invite.token));
			} catch {
				// Clipboard access can be denied by the browser — the link is
				// still shown on the page, so this is a nice-to-have, not fatal.
			}
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create invite.';
		} finally {
			creatingInvite = false;
		}
	}

	async function handleRevoke(invite: ListInviteDto) {
		invites = invites.filter((current) => current.id !== invite.id);
		try {
			await revokeInvite(listId, invite.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to revoke invite.';
			void loadAll();
		}
	}
</script>

<svelte:head>
	<title>{list ? `${list.name} members — EveryList` : 'Members — EveryList'}</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader
		title={list ? `${list.name} — Members` : undefined}
		backHref={resolve('/lists/[id]/settings', { id: String(listId) })}
		backLabel="Back to settings"
	/>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if list}
		<section class="flex flex-col gap-2">
			<h2 class="text-sm font-semibold">Members</h2>
			<ul class="flex flex-col gap-2">
				{#each members as member (member.id)}
					<li
						class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
					>
						<div class="flex flex-col">
							<span>{member.user.fullName ?? member.user.email}</span>
							<span class="text-xs text-gray-600 dark:text-gray-400">{member.user.email}</span>
						</div>
						<div class="ml-auto flex items-center gap-2">
							{#if isOwner && member.role !== 'owner'}
								<select
									class="rounded border border-gray-300 bg-white text-sm dark:border-gray-600 dark:bg-gray-800"
									onchange={(event) =>
										handleRoleChange(
											member,
											event.currentTarget.value as Exclude<ListRole, 'owner'>
										)}
								>
									<option value="editor" selected={member.role === 'editor'}>Editor</option>
									<option value="viewer" selected={member.role === 'viewer'}>Viewer</option>
								</select>
								<button
									type="button"
									class="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
									onclick={() => handleRemove(member)}
								>
									Remove
								</button>
							{:else}
								<span class="text-sm text-gray-600 capitalize dark:text-gray-400"
									>{member.role}</span
								>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>

		{#if isOwner}
			<section class="flex flex-col gap-2">
				<h2 class="text-sm font-semibold">Add someone you already share a list with</h2>
				{#if candidates.length === 0}
					<p class="text-sm text-gray-600 dark:text-gray-400">
						No one yet — people you already share another list with can be added here without a
						link.
					</p>
				{:else}
					<ul class="flex flex-col gap-2">
						{#each candidates as candidate (candidate.user.id)}
							<li
								class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700"
							>
								<div class="flex flex-col">
									<span>{candidate.user.fullName ?? candidate.user.email}</span>
									<span class="text-xs text-gray-600 dark:text-gray-400">
										Shares {candidate.sharedListNames.join(', ')}
									</span>
								</div>
								<div class="ml-auto flex items-center gap-2">
									<select
										class="rounded border border-gray-300 bg-white text-sm dark:border-gray-600 dark:bg-gray-800"
										bind:value={newMemberRole}
									>
										<option value="editor">Editor</option>
										<option value="viewer">Viewer</option>
									</select>
									<Button
										type="button"
										size="sm"
										disabled={addingMember}
										onclick={() => handleAddMember(candidate)}
									>
										Add
									</Button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="flex flex-col gap-2">
				<h2 class="text-sm font-semibold">Invite by link</h2>
				<form class="flex gap-2" onsubmit={handleCreateInvite}>
					<select
						class="rounded border border-gray-300 bg-white text-sm dark:border-gray-600 dark:bg-gray-800"
						bind:value={newInviteRole}
					>
						<option value="editor">Editor</option>
						<option value="viewer">Viewer</option>
					</select>
					<Button type="submit" disabled={creatingInvite}>Create invite link</Button>
				</form>

				{#if lastCreatedToken}
					<p class="text-sm break-all text-gray-600 dark:text-gray-300">
						{joinUrl(lastCreatedToken)}
					</p>
				{/if}

				{#if invites.length > 0}
					<ul class="flex flex-col gap-2">
						{#each invites as invite (invite.id)}
							<li
								class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700"
							>
								<span class="capitalize">{invite.role}</span>
								<span class="text-gray-600 dark:text-gray-400">invite</span>
								<button
									type="button"
									class="ml-auto text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
									onclick={() => handleRevoke(invite)}
								>
									Revoke
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	{/if}
</main>
