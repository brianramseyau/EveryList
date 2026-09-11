import { getServerUrl } from './server-url';
import { ingressBase } from './ingress';

/**
 * Path/origin to prefix every API/realtime request with — empty for same-origin web/PWA/Docker
 * builds (today's behavior, unchanged); the Home Assistant Ingress path prefix when served
 * through Supervisor's Ingress proxy (see `ingress.ts` — takes priority, since it reflects the
 * actual page the browser loaded); or the user-configured server URL for the Capacitor native
 * build, whose WebView runs on a local scheme (`capacitor://localhost`) rather than the real
 * server. Shared by `client.ts` (HTTP) and `realtime.ts` (Transmit/SSE) so both sides of the app
 * agree on where "the server" is.
 *
 * The native/native-like source is sourced at runtime from `server-url.ts` (a persisted,
 * user-editable setting — see `/server-setup`, PLAN_13_PHASE_NATIVE_APP_SHELL.md §1) rather than
 * baked in at build time: a self-hosted client app shouldn't hard-code one server's address into
 * the binary, the same way Nextcloud/Audiobookshelf/Donetick's native apps ask for a server on
 * first launch instead. Kept in its own module (rather than living on `client.ts`) so importing
 * it doesn't pull in `client.ts`'s other dependencies.
 */
export function apiBaseUrl(): string {
	const ingress = ingressBase();
	return ingress !== '' ? ingress : getServerUrl();
}
