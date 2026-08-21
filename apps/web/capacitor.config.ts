import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell config for the Capacitor wrapper (PHASE13_PLAN.md §2). `webDir: 'build'` matches
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
	}
};

export default config;
