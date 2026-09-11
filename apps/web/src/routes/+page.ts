import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getToken } from '$lib/api/token';
import { ingressBase } from '$lib/api/ingress';
import { fetchSetupStatus } from '$lib/api/setup';

/** Races `promise` against a plain timer rather than an `AbortSignal` — `fetchSetupStatus` has no
 * way to accept one — clearing the timer either way so a promise that settles first (the normal
 * case) doesn't leave a dangling handle behind (harmless in the browser, but keeps Node/Vitest
 * teardown waiting on it otherwise). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((settle, reject) => {
		const timer = setTimeout(() => reject(new Error('Timed out')), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				settle(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

// Deliberately still prerendered (unlike setup/+page.ts): adapter-static's baked index.html for
// "/" is what AdonisJS's static middleware serves for a bare GET / (see docker-smoke's `curl / |
// grep EveryList` in .github/workflows/ci.yml) and, separately, what Capacitor's native local
// server falls back to for any unmatched deep route (vite.config.ts's `paths.relative` comment) —
// dropping prerendering here breaks both. The flash this route used to have (briefly showing the
// real splash before redirecting) is instead solved in +page.svelte itself, which renders a
// neutral loading placeholder — present in this prerendered HTML too — until this `load` (which
// still reruns after hydration) has resolved.
//
// This route is a splash/setup landing for a logged-out visitor only — a signed-in user
// belongs at /lists instead. Handled here in `load` rather than the component's own onMount so
// the redirect fires as soon as SvelteKit's router resolves it, without waiting on mount.
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
	// shows. Bounded to 5s so a server that accepts the connection but never answers (or a
	// native/desktop build with no server configured at all, see +layout.svelte's onMount) can't
	// leave the loading placeholder spinning indefinitely — +layout.svelte's own
	// redirectToSetupIfNeeded still runs as an unbounded backstop after mount regardless, and
	// /setup and every other route re-validate server-side too, so silently falling through to the
	// splash on a timeout or any other error here is safe.
	let needsSetup = false;
	try {
		needsSetup = (await withTimeout(fetchSetupStatus(), 5000)).needsSetup;
	} catch {
		// Fail open — see comment above.
	}
	if (needsSetup) throw redirect(307, `${ingressBase()}${resolve('/setup')}`);
}
