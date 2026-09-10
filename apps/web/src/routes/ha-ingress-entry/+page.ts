import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

// Home Assistant Supervisor's Ingress proxy requests this exact path first (see
// ha-addon/everylist/config.yaml's `ingress_entry`) - it needs to be a real route so SvelteKit's
// client router doesn't render its own 404 after hydration, but every real page in this app is
// prerendered by default (apps/web/src/routes/+layout.ts), which would make it a static file
// served by @adonisjs/static before apps/api's ingress-aware rewrite route ever runs (see
// apps/api/app/services/ingress_service.ts). `prerender = false` keeps this one route dependent
// on the adapter-static fallback shell instead, so it always reaches that rewrite. Once hydrated,
// this immediately hands off to `/`'s own existing "signed-in -> /lists, else show the splash"
// logic rather than duplicating it - see foundational/PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md.
export const prerender = false;

export function load() {
	throw redirect(307, resolve('/'));
}
