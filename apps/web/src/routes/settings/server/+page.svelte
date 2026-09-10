<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Toggle } from 'flowbite-svelte';
	import type { ServerConfigFieldDto, ServerConfigStateDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchServerConfig, updateServerConfig } from '$lib/api/server-config';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Loader from '$lib/components/Loader.svelte';

	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state(false);
	let config = $state<ServerConfigStateDto | null>(null);

	// Draft form values, separate from `config` — text fields shouldn't snap back to the server's
	// last-saved value while the admin is still typing in a sibling field.
	let publicSignupEnabled = $state(true);
	let appUrl = $state('');
	let mailHost = $state('');
	// A Flowbite number input's bind:value hands back `null` when emptied, not `''` — see
	// lists/[id]/settings/+page.svelte's draftLimitText for the same gotcha — so this has to
	// accept null too, normalized alongside '' wherever "unchanged" is checked below.
	let mailPort = $state<number | string | null>('');
	let mailUsername = $state('');
	let mailPassword = $state('');
	let mailFromAddress = $state('');
	let mailFromName = $state('');
	let alexaSkillId = $state('');
	let authentikTokenUrl = $state('');
	let authentikUserinfoUrl = $state('');
	let authentikClientId = $state('');
	let authentikClientSecret = $state('');

	function applyState(next: ServerConfigStateDto) {
		config = next;
		publicSignupEnabled = (next.publicSignupEnabled.value as boolean | null) ?? true;
		appUrl = (next.appUrl.value as string | null) ?? '';
		mailHost = (next.mailHost.value as string | null) ?? '';
		mailPort = (next.mailPort.value as number | null) ?? '';
		mailUsername = (next.mailUsername.value as string | null) ?? '';
		mailPassword = '';
		mailFromAddress = (next.mailFromAddress.value as string | null) ?? '';
		mailFromName = (next.mailFromName.value as string | null) ?? '';
		alexaSkillId = (next.alexaSkillId.value as string | null) ?? '';
		authentikTokenUrl = (next.authentikTokenUrl.value as string | null) ?? '';
		authentikUserinfoUrl = (next.authentikUserinfoUrl.value as string | null) ?? '';
		authentikClientId = (next.authentikClientId.value as string | null) ?? '';
		authentikClientSecret = '';
	}

	async function loadAll() {
		loading = true;
		try {
			applyState(await fetchServerConfig());
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load server settings.';
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

	function isLocked(field: ServerConfigFieldDto | undefined): boolean {
		return field?.source === 'env';
	}

	async function handleSave(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		try {
			// Locked (env-set) fields are never sent — the server rejects them outright, and they're
			// disabled in the form anyway so their draft value can't reflect an actual edit. Blank
			// text fields are also omitted rather than sent as `''`: they mean "untouched", not "clear
			// this value" (the url()/email() validators would reject an empty string besides), the
			// same "leave unchanged" contract the password fields below already use.
			/* v8 ignore next -- the form (and this submit handler) only renders once config has
			   loaded, inside `{:else if config}` below; unreachable through the UI. */
			if (!config) return;
			const next = await updateServerConfig({
				...(!isLocked(config.publicSignupEnabled) && { publicSignupEnabled }),
				...(!isLocked(config.appUrl) && appUrl && { appUrl }),
				...(!isLocked(config.mailHost) && mailHost && { mailHost }),
				...(!isLocked(config.mailPort) &&
					mailPort !== '' &&
					mailPort !== null && { mailPort: Number(mailPort) }),
				...(!isLocked(config.mailUsername) && mailUsername && { mailUsername }),
				...(!isLocked(config.mailPassword) && mailPassword && { mailPassword }),
				...(!isLocked(config.mailFromAddress) && mailFromAddress && { mailFromAddress }),
				...(!isLocked(config.mailFromName) && mailFromName && { mailFromName }),
				...(!isLocked(config.alexaSkillId) && alexaSkillId && { alexaSkillId }),
				...(!isLocked(config.authentikTokenUrl) && authentikTokenUrl && { authentikTokenUrl }),
				...(!isLocked(config.authentikUserinfoUrl) &&
					authentikUserinfoUrl && { authentikUserinfoUrl }),
				...(!isLocked(config.authentikClientId) && authentikClientId && { authentikClientId }),
				...(!isLocked(config.authentikClientSecret) &&
					authentikClientSecret && { authentikClientSecret })
			});
			applyState(next);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to save server settings.';
		} finally {
			saving = false;
		}
	}
</script>

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="Server settings" backHref={resolve('/settings')} />

	<p class="text-sm text-gray-600 dark:text-gray-400">
		Backed by <code>config.yaml</code> in the server's <code>/config</code> volume — changes apply immediately,
		no restart needed. A field disabled below is set via an environment variable instead, which always
		takes priority.
	</p>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loading}
		<Loader />
	{:else if config}
		{#if !config.writable}
			<p
				class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
			>
				<code>{config.configPath}</code> isn't writable (likely mounted read-only) — settings below are
				shown for reference but can't be saved from here.
			</p>
		{/if}

		<form class="flex flex-col gap-5" onsubmit={handleSave}>
			<section class="flex flex-col gap-3">
				<h2 class="text-sm font-semibold">General</h2>

				<Toggle
					checked={publicSignupEnabled}
					disabled={isLocked(config.publicSignupEnabled) || !config.writable}
					onchange={() => (publicSignupEnabled = !publicSignupEnabled)}
				>
					Allow public signups
				</Toggle>
				<span class="-mt-2 text-xs text-gray-500 dark:text-gray-400">
					Off blocks new self-service accounts; list invites still work either way.
					{#if isLocked(config.publicSignupEnabled)}Set via PUBLIC_SIGNUP_ENABLED.{/if}
				</span>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">App URL</span>
					<input
						type="url"
						aria-label="App URL"
						disabled={isLocked(config.appUrl) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={appUrl}
					/>
					<span class="text-xs text-gray-500 dark:text-gray-400">
						Used in emailed links and Alexa icon URLs.
						{#if isLocked(config.appUrl)}Set via APP_URL.{/if}
					</span>
				</label>
			</section>

			<section class="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
				<h2 class="text-sm font-semibold">Mail (SMTP)</h2>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">Host</span>
					<input
						aria-label="Mail host"
						disabled={isLocked(config.mailHost) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={mailHost}
					/>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">Port</span>
					<input
						type="number"
						aria-label="Mail port"
						min="1"
						max="65535"
						disabled={isLocked(config.mailPort) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={mailPort}
					/>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">Username</span>
					<input
						aria-label="Mail username"
						disabled={isLocked(config.mailUsername) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={mailUsername}
					/>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">Password</span>
					<input
						type="password"
						aria-label="Mail password"
						placeholder={config.mailPassword.isSet ? '••••••••' : ''}
						disabled={isLocked(config.mailPassword) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={mailPassword}
					/>
					<span class="text-xs text-gray-500 dark:text-gray-400"
						>Leave blank to keep unchanged.</span
					>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">From address</span>
					<input
						type="email"
						aria-label="Mail from address"
						disabled={isLocked(config.mailFromAddress) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={mailFromAddress}
					/>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">From name</span>
					<input
						aria-label="Mail from name"
						disabled={isLocked(config.mailFromName) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={mailFromName}
					/>
				</label>
			</section>

			<section class="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
				<h2 class="text-sm font-semibold">Alexa</h2>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">Skill ID</span>
					<input
						aria-label="Alexa skill ID"
						disabled={isLocked(config.alexaSkillId) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={alexaSkillId}
					/>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">Authentik token URL</span>
					<input
						type="url"
						aria-label="Authentik token URL"
						disabled={isLocked(config.authentikTokenUrl) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={authentikTokenUrl}
					/>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">Authentik userinfo URL</span>
					<input
						type="url"
						aria-label="Authentik userinfo URL"
						disabled={isLocked(config.authentikUserinfoUrl) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={authentikUserinfoUrl}
					/>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">Authentik client ID</span>
					<input
						aria-label="Authentik client ID"
						disabled={isLocked(config.authentikClientId) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={authentikClientId}
					/>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">Authentik client secret</span>
					<input
						type="password"
						aria-label="Authentik client secret"
						placeholder={config.authentikClientSecret.isSet ? '••••••••' : ''}
						disabled={isLocked(config.authentikClientSecret) || !config.writable}
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800"
						bind:value={authentikClientSecret}
					/>
					<span class="text-xs text-gray-500 dark:text-gray-400"
						>Leave blank to keep unchanged.</span
					>
				</label>
			</section>

			<Button type="submit" size="sm" disabled={saving || !config.writable}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		</form>
	{/if}
</main>
