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
			checkForUpdate: () => Promise<
				| { status: 'update-available'; latestVersion: string; url: string }
				| { status: 'up-to-date' }
				| { status: 'error'; message: string }
			>;
			// Deadline notifications (PLAN_26_PHASE_DEADLINE_NOTIFICATIONS.md): closing the window
			// hides to a tray icon instead of quitting only while this is enabled, so
			// $lib/notifications/electron.ts's timers keep running in the background.
			setBackgroundRun: (enabled: boolean) => Promise<void>;
		};
		// Injected as an inline <script> by apps/api's SPA-fallback route (see
		// #services/ingress_service on the API side) only when the request came through Home
		// Assistant Supervisor's Ingress proxy — undefined everywhere else. See $lib/api/ingress.ts
		// and PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md.
		__EVERYLIST_INGRESS_BASE__?: string;
	}
}

export {};
