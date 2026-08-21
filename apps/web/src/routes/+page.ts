import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getToken } from '$lib/api/token';

// This route is a splash/setup landing for a logged-out visitor only — a signed-in user
// belongs at /lists instead. Handled here in `load`, which SvelteKit resolves before the page
// component is ever mounted, rather than in the component's own onMount, so a signed-in user
// is routed straight to /lists instead of the splash briefly rendering first.
export function load() {
	if (getToken()) throw redirect(307, resolve('/lists'));
}
