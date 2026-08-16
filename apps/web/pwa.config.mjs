// Shared between vite.config.ts (VitePWA's `manifest` option, and its
// `workbox` option for dev-time/intermediate output) and
// scripts/generate-sw.mjs (the postbuild step that regenerates the real
// sw.js — see that script for why the plugin's own build-time sw.js can't
// be trusted as the shipped artifact).

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
	globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
	// The icon-picker's lazily-loaded @mdi/js chunk is ~2.8MB — above Workbox's
	// default 2MB precache limit. It's still lazy (only fetched when the icon
	// picker opens), just also precached up front like everything else here.
	maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
	runtimeCaching: [
		{
			/** @param {{ url: URL; request: Request }} args */
			urlPattern: ({ url, request }) =>
				url.pathname.startsWith('/api/v1/') && request.method === 'GET',
			handler: 'StaleWhileRevalidate',
			options: { cacheName: 'api-get-cache' }
		}
	]
};
