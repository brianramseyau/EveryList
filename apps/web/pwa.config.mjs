// SvelteKitPWA's manifest/workbox config, pulled out of vite.config.ts to
// keep that file's plugin list readable — see the SvelteKitPWA call there
// for why `@vite-pwa/sveltekit` (not plain `vite-plugin-pwa`) is used.

/** @type {Partial<import('vite-plugin-pwa').ManifestOptions>} */
export const pwaManifest = {
	name: 'EveryList',
	short_name: 'EveryList',
	description: 'Shared, offline-first lists for everything.',
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
	// Workbox's own default denylist only excludes URLs whose last path segment
	// contains a dot (so it doesn't hijack requests for actual files) — `/docs`,
	// `/openapi`, and `/api/*` (e.g. an Alexa icon URL like
	// `/api/v1/alexa/icons/cheese`, whose last segment has no extension either)
	// don't match that, so without this they get swept into the SPA fallback and
	// served the app shell instead of reaching AdonisJS, which renders as a
	// client-side 404 until a hard reload bypasses the SW. Only bites a direct
	// browser-tab navigation to one of these URLs (`request.mode === 'navigate'`
	// — pasting a link, following a redirect) — normal in-app `fetch()` calls
	// aren't navigation requests and were never affected, which is why this
	// only surfaces when manually poking a URL rather than through regular use.
	navigateFallbackDenylist: [/^\/docs/, /^\/openapi/, /^\/api\//],
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
				url.pathname.startsWith('/api/v1/') &&
				url.pathname !== '/api/v1/ping' &&
				request.method === 'GET',
			// NetworkFirst (not StaleWhileRevalidate): a GET made right after a
			// mutation (e.g. reloading the list screen after editing an item, or
			// the list index after creating a list) must see the fresh server
			// state, not a stale cached response served ahead of the revalidation.
			// The cache is still used as an offline fallback when the network
			// request fails.
			handler: 'NetworkFirst',
			options: {
				cacheName: 'api-get-cache',
				plugins: [
					{
						// A reverse-proxy hiccup mid-restart can return a 200 with an
						// HTML placeholder/error page instead of the real JSON body —
						// never let that get cached as if it were a legitimate API
						// response (see the SWAG-splash-screen incident writeup).
						/** @param {{ response: Response }} args */
						cacheWillUpdate: async ({ response }) => {
							const contentType = response.headers.get('content-type') ?? '';
							return contentType.includes('application/json') ? response : null;
						}
					}
				]
			}
		}
	]
};
