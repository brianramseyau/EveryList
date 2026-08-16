// SvelteKitPWA's manifest/workbox config, pulled out of vite.config.ts to
// keep that file's plugin list readable — see the SvelteKitPWA call there
// for why `@vite-pwa/sveltekit` (not plain `vite-plugin-pwa`) is used.

/** @type {Partial<import('vite-plugin-pwa').ManifestOptions>} */
export const pwaManifest = {
	name: 'EveryList',
	short_name: 'EveryList',
	description: 'Shared, offline-first shopping lists.',
	start_url: '/lists',
	scope: '/',
	display: 'standalone',
	background_color: '#f6f5f1',
	theme_color: '#33404f',
	icons: [
		{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
		{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
	]
};

/** @type {Partial<import('workbox-build').GenerateSWOptions>} */
export const workboxOptions = {
	navigateFallback: '/200.html',
	// `@vite-pwa/sveltekit` globs `.svelte-kit/output/` (client build + SvelteKit's
	// own prerendered output), not the final flat `build/` directory adapter-static
	// produces later — hence the `client/`/`prerendered/` prefixes. It auto-adds its
	// own defaults for any prefix left unspecified, so this list has to be complete
	// (icons/fonts/webmanifest under `client/`, HTML+JSON under `prerendered/`) or
	// those defaults silently replace it instead of merging.
	globPatterns: [
		'client/**/*.{js,css,ico,png,svg,woff,woff2}',
		'client/*.webmanifest',
		'prerendered/**/*.{html,json}'
	],
	// The icon-picker's lazily-loaded @mdi/js chunk is ~2.8MB — above Workbox's
	// default 2MB precache limit. It's still lazy (only fetched when the icon
	// picker opens), just also precached up front like everything else here.
	maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
	runtimeCaching: [
		{
			/** @param {{ url: URL; request: Request }} args */
			urlPattern: ({ url, request }) =>
				url.pathname.startsWith('/api/v1/') && request.method === 'GET',
			// NetworkFirst (not StaleWhileRevalidate): a GET made right after a
			// mutation (e.g. reloading the list screen after editing an item, or
			// the list index after creating a list) must see the fresh server
			// state, not a stale cached response served ahead of the revalidation.
			// The cache is still used as an offline fallback when the network
			// request fails.
			handler: 'NetworkFirst',
			options: { cacheName: 'api-get-cache' }
		}
	]
};
