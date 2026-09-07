/* v8 ignore start */ // Imports: other specs' `vi.mock('@capacitor/...')` corrupts their V8
// function attribution once merged into the full suite — the same coverage-collection
// artifact documented on `lib/widget.ts`.
import { Capacitor } from '@capacitor/core';
/* v8 ignore stop */

/** The native handoff channel (the Capacitor `AuthMirrorPlugin`, Android-only) — mirrors the
 * app's own session token + server URL into native `SharedPreferences` so
 * `DeadlineNotificationActionReceiver` can authenticate the deadline notification's
 * "Complete"/"Snooze" actions without a WebView, the same role `push-sw.js`'s IndexedDB token
 * mirror plays for the PWA build (see `$lib/api/token.ts`'s `mirrorTokenToServiceWorker`).
 * Android-only rather than every native platform: iOS's `foreground: false` already keeps those
 * actions off the UI thread with no native mirror needed, so no `AuthMirror` plugin exists there
 * — calling through `Capacitor.registerPlugin` on iOS would just fail with a
 * "plugin is not implemented" rejection. */
interface AuthMirrorNative {
	setToken(options: { token: string; serverUrl: string }): Promise<void>;
	clearToken(): Promise<void>;
}

function nativeAuthMirrorClient(): AuthMirrorNative | null {
	if (Capacitor.getPlatform() !== 'android') return null;
	return Capacitor.registerPlugin<AuthMirrorNative>('AuthMirror');
}

/** Mirrors (or clears, when `token` is null) the session token + server URL into native storage.
 * A no-op everywhere but the Android native build. Fire-and-forget by design — the same
 * best-effort treatment `mirrorTokenToServiceWorker` gives its own IndexedDB mirror, since a
 * failure here only degrades the background notification actions to their "couldn't update"
 * fallback, not the app itself. */
export function mirrorAuthToNative(token: string | null, serverUrl: string): void {
	const client = nativeAuthMirrorClient();
	if (!client) return;

	const request = token ? client.setToken({ token, serverUrl }) : client.clearToken();
	void request.catch((error: unknown) => {
		console.error('Failed to mirror auth token to native storage', error);
	});
}
