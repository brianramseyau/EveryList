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
		};
	}
}

export {};
