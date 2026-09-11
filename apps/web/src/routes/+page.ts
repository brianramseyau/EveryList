import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getToken } from '$lib/api/token';
import { ingressBase } from '$lib/api/ingress';
import { fetchSetupStatus } from '$lib/api/setup';

// Which of {splash, /lists, /setup} belongs here depends on live state (an existing session, a
// live setup-status check) that a build-time prerender can't know — same reasoning as
// setup/+page.ts's own prerender opt-out. Left prerendered, adapter-static bakes the anonymous
// splash markup into a static index.html that AdonisJS's static middleware serves byte-for-byte
// ahead of any JS: a signed-in visitor, or a fresh instance that needs /setup, would see that
// splash paint first and only swap to the right destination once this `load` ran afterwards —
// the same flash-before-redirect race /setup itself exists to avoid on the other side of the
// split. Opting out routes "/" through the SPA fallback shell (200.html) instead, so nothing
// paints until `load` (resolved before the page component ever mounts) has already decided.
export const prerender = false;
export const ssr = false;

// This route is a splash/setup landing for a logged-out visitor only — a signed-in user
// belongs at /lists instead. Handled here in `load`, which SvelteKit resolves before the page
// component is ever mounted, rather than in the component's own onMount, so a signed-in user
// is routed straight to /lists instead of the splash briefly rendering first.
//
// `ingressBase()` prefix: this is the very first redirect a signed-in visitor hits on every
// fresh load under Home Assistant Ingress — ha-ingress-entry/+page.ts redirects here first, and
// once a user exists (i.e. always, past initial setup), this redirect fires immediately after.
// Without the prefix, `resolve('/lists')` alone drops the Ingress path out of the address bar on
// literally every session, same reasoning as ha-ingress-entry/+page.ts's own redirect. Outside
// Ingress `ingressBase()` is '' and this is unchanged.
export async function load() {
	if (getToken()) throw redirect(307, `${ingressBase()}${resolve('/lists')}`);

	// A fresh instance with no user yet needs the first-run setup wizard before this splash ever
	// paints. Checked here (resolved before the component mounts) rather than relying solely on
	// +layout.svelte's onMount, which races this exact page: the splash would render first and
	// only swap to /setup once that async status check resolved afterwards. Fails open on error,
	// same reasoning as the layout's own redirectToSetupIfNeeded — /setup and every other route
	// re-validate server-side regardless, so silently falling through to the splash here is safe.
	let needsSetup = false;
	try {
		needsSetup = (await fetchSetupStatus()).needsSetup;
	} catch {
		// Fail open — see comment above.
	}
	if (needsSetup) throw redirect(307, `${ingressBase()}${resolve('/setup')}`);
}
