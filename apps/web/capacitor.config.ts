import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell config for the Capacitor wrapper (PLAN_13_PHASE_NATIVE_APP_SHELL.md §2). `webDir: 'build'` matches
 * `@sveltejs/adapter-static`'s default output directory (see `vite.config.ts`'s `adapter()` call)
 * — the same static bundle the Docker image serves, loaded locally instead of over the network.
 *
 * `ios.path`/`android.path` point the generated native projects out to `apps/ios/` and
 * `apps/android/` — top-level siblings of `apps/web`/`apps/api`, matching this repo's existing
 * `apps/<platform>` layout, rather than nesting them inside `apps/web`.
 */
const config: CapacitorConfig = {
	appId: 'au.brianramsey.everylist',
	appName: 'EveryList',
	webDir: 'build',
	ios: {
		path: '../ios'
	},
	android: {
		path: '../android'
	},
	plugins: {
		// The app talks to a user-configured, cross-origin server (see server-url.ts) and sends an
		// `Authorization` header on every authenticated request. That combination forces a CORS
		// preflight `OPTIONS` round trip before every real request under the WebView's own fetch/XHR
		// stack. Routing through the native OS HTTP client instead (OkHttp on Android, URLSession on
		// iOS) skips the browser CORS model entirely — no preflight, ever — since CORS is a
		// browser-enforced policy that native HTTP clients don't implement. `apiFetch` (client.ts)
		// and Transmit's subscription create/delete (realtime.ts, which calls plain `fetch`) both
		// benefit; the actual SSE stream uses `EventSource` directly (transmit-client's
		// `eventSourceFactory`), which this plugin does not intercept, so realtime behavior is
		// unaffected either way.
		CapacitorHttp: {
			enabled: true
		}
	}
};

export default config;
