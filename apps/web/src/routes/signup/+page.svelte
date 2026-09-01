<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { Button, Label, Input, Helper } from 'flowbite-svelte';
	import { signup } from '$lib/api/auth';
	import { fetchMeta } from '$lib/api/meta';
	import { ApiError } from '$lib/api/client';
	import Loader from '$lib/components/Loader.svelte';

	let fullName = $state('');
	let email = $state('');
	let password = $state('');
	let passwordConfirmation = $state('');
	let error = $state<string | null>(null);
	let submitting = $state(false);
	// Gates the form behind a meta check so a disabled public-signup instance
	// never shows a form that would just 403 on submit. Invite-token signup
	// always bypasses this check below, matching the server-side exemption in
	// NewAccountController.
	let checkingAccess = $state(true);

	// After accepting a join link while logged out, `next` sends the user
	// back to /join/[token] instead of the default /lists landing. This is a
	// prerendered static route (adapter-static) — reading url.searchParams
	// during the server-side prerender pass throws, so this only reads it in
	// the browser after hydration.
	// The `: null` branch only fires during the server-side prerender pass;
	// this component is only ever tested in the browser project (real
	// Chromium, `browser` always true there), so it's untestable here.
	/* v8 ignore next */
	const nextPath = $derived(browser ? page.url.searchParams.get('next') : null);
	// nextPath, when present, is always this app's own resolve('/join/[token]', …)
	// output round-tripped through a query param — safe, but not statically
	// verifiable by the lint rule, hence the ResolvedPathname cast (same
	// technique PageHeader.svelte's backHref prop uses).
	const loginHref = $derived(
		(nextPath
			? `${resolve('/login')}?next=${encodeURIComponent(nextPath)}`
			: resolve('/login')) as ResolvedPathname
	);
	// When `next` points back at a join link, extract its token so signup can
	// go through even if public signup is disabled.
	const inviteToken = $derived(nextPath?.match(/\/join\/([^/?]+)/)?.[1]);

	onMount(async () => {
		if (inviteToken) {
			checkingAccess = false;
			return;
		}
		let publicSignupEnabled = true;
		try {
			({ publicSignupEnabled } = await fetchMeta());
		} catch {
			// Fail open — see the login page's identical fallback.
		}
		if (!publicSignupEnabled) {
			await goto(loginHref, { replaceState: true });
			return;
		}
		checkingAccess = false;
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		submitting = true;
		try {
			await signup({
				fullName: fullName.trim() || null,
				email,
				password,
				passwordConfirmation,
				inviteToken
			});
			// nextPath, when present, is always this app's own resolve('/join/[token]', …)
			// output round-tripped through a query param — safe, but not statically
			// verifiable by the lint rule below.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(nextPath ?? resolve('/lists'));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Sign up — EveryList</title>
</svelte:head>

<main
	class="mx-auto flex max-w-sm flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<h1 class="text-2xl font-bold">Sign up</h1>

	{#if checkingAccess}
		<Loader />
	{:else}
		<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
			<div>
				<Label for="fullName" class="mb-2">Name (optional)</Label>
				<Input id="fullName" bind:value={fullName} autocomplete="name" />
			</div>
			<div>
				<Label for="email" class="mb-2">Email</Label>
				<Input id="email" type="email" bind:value={email} required autocomplete="email" />
			</div>
			<div>
				<Label for="password" class="mb-2">Password</Label>
				<Input
					id="password"
					type="password"
					bind:value={password}
					required
					minlength={8}
					autocomplete="new-password"
				/>
			</div>
			<div>
				<Label for="passwordConfirmation" class="mb-2">Confirm password</Label>
				<Input
					id="passwordConfirmation"
					type="password"
					bind:value={passwordConfirmation}
					required
					minlength={8}
					autocomplete="new-password"
				/>
			</div>

			{#if error}
				<Helper class="text-red-600 dark:text-red-400">{error}</Helper>
			{/if}

			<Button type="submit" disabled={submitting}>{submitting ? 'Signing up…' : 'Sign up'}</Button>
		</form>

		<p class="text-sm text-gray-600 dark:text-gray-300">
			Already have an account?
			<a href={loginHref} class="text-primary-700 underline dark:text-primary-400">Log in</a>
		</p>
	{/if}
</main>
