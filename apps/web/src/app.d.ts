/// <reference types="vite-plugin-pwa/client" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		// Exposed by apps/desktop/preload.cjs's contextBridge — undefined everywhere except the
		// Electron desktop build. See $lib/platform/desktop.ts and
		// PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §1.
		everylistDesktop?: {
			version: string;
			platform: string;
			// 'remote' (thin-client mode, explicitly recorded — see recordRemoteMode) or 'standalone'
			// (embedded server, see PLAN_31_PHASE_DESKTOP_STANDALONE_MODE.md and
			// $lib/platform/desktop.ts's isStandalone()), or null when no choice has been recorded
			// yet (first run, before /server-setup completes either path) — distinct from 'remote'
			// specifically so /server-setup can tell "never decided" (offer standalone) apart from
			// "already an established remote install" (don't re-offer standalone just because the
			// user is changing which server they point at). Read fresh by preload.cjs on every page
			// load — it can change mid-session, since enableStandalone() below does a full origin
			// navigation.
			mode: 'remote' | 'standalone' | null;
			checkForUpdate: () => Promise<
				| { status: 'update-available'; latestVersion: string; url: string }
				| { status: 'up-to-date' }
				| { status: 'error'; message: string }
			>;
			// Deadline notifications (PLAN_26_PHASE_DEADLINE_NOTIFICATIONS.md): closing the window
			// hides to a tray icon instead of quitting only while this is enabled, so
			// $lib/notifications/electron.ts's timers keep running in the background.
			setBackgroundRun: (enabled: boolean) => Promise<void>;
			// One-time switch into Standalone mode, offered from /server-setup on first run. See
			// PLAN_31_PHASE_DESKTOP_STANDALONE_MODE.md's "First-run flow".
			enableStandalone: () => Promise<{ port: number }>;
			// Explicitly records the "connect to my own server" choice — called once /server-setup's
			// plain server-URL form succeeds, so `mode` reads 'remote' (not null) on every later visit.
			recordRemoteMode: () => Promise<void>;
			// Reads and clears the session token Standalone mode's auto-provisioned setup minted —
			// see apps/web/src/routes/+layout.svelte's onMount.
			consumeStandaloneToken: () => string | null;
		};
		// Injected as an inline <script> by apps/api's SPA-fallback route (see
		// #services/ingress_service on the API side) only when the request came through Home
		// Assistant Supervisor's Ingress proxy — undefined everywhere else. See $lib/api/ingress.ts
		// and PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md.
		__EVERYLIST_INGRESS_BASE__?: string;
	}
}

export {};
