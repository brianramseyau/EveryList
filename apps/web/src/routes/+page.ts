import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getToken } from '$lib/api/token';
import { ingressBase } from '$lib/api/ingress';

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
export function load() {
	if (getToken()) throw redirect(307, `${ingressBase()}${resolve('/lists')}`);
}
