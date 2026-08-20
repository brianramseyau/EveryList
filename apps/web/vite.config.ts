import { existsSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { pwaManifest, workboxOptions } from './pwa.config.mjs';

// Some sandboxed dev environments pre-cache a Chromium build at a fixed path
// under a different revision than the one this Playwright version expects,
// so the default revision-based lookup fails there even though a working
// browser binary is sitting right next to it. CI (and any environment that
// ran `playwright install`) never has this path, so this only ever applies
// there — everywhere else falls through to Playwright's normal resolution.
const sandboxChromiumPath = '/opt/pw-browsers/chromium';
const chromiumLaunchOptions = existsSync(sandboxChromiumPath)
	? { executablePath: sandboxChromiumPath }
	: {};

// The dev service worker is opt-in via `pnpm dev:sw` (sets PWA_DEV) — ordinary
// `vite dev` stays free of the stale-cache headaches a dev SW introduces during
// hot reload, and production builds never set it.
const devSW = process.env.PWA_DEV === 'true';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// fallback: dynamic routes (e.g. /lists/[id]) have no known params at
			// build time, so they can't be prerendered — the fallback shell lets
			// SvelteKit's client-side router take over for those at runtime.
			// Named 200.html (not the default index.html) so it doesn't collide
			// with the prerendered "/" page — AdonisJS serves it explicitly as
			// the catch-all for unmatched routes (see docker/Dockerfile).
			adapter: adapter({ fallback: '200.html' })
		}),
		// `generateSW` (not `injectManifest`) — every caching rule this app needs
		// (precache the app shell, stale-while-revalidate on API GETs, an offline
		// navigation fallback) is fully declarative, so no custom SW source file is
		// needed.
		//
		// `@vite-pwa/sveltekit` (not plain `vite-plugin-pwa`) specifically because
		// plain `vite-plugin-pwa` globs the built output from a `writeBundle` hook,
		// which fires before @sveltejs/adapter-static prerenders this app's HTML and
		// copies it into `build/` (that happens in SvelteKit's own `closeBundle`, a
		// later hook) — its precache manifest ends up with zero .html entries,
		// including /200.html, the navigateFallback target every offline cold start
		// needs. This package generates the SW from the *server* build's
		// `closeBundle` instead — after SvelteKit's own prerender crawl has written
		// `.svelte-kit/output/prerendered/`, but before the adapter runs — then
		// relocates the finished sw.js into `.svelte-kit/output/client/` so
		// adapter-static's later copy picks it up like any other static asset. That
		// correctly precaches every *prerendered* route (login/signup/lists/etc.).
		//
		// The one thing it still can't see at that point is the adapter's fallback
		// page (200.html): `builder.generateFallback()` — which actually renders it —
		// is called by adapter-static itself, inside `adapt()`, which runs *after*
		// this plugin's closeBundle (`kit.adapterFallback` alone, which just renames
		// a pre-existing precache entry, is a no-op here — there's nothing to rename
		// yet). `kit.spa: true` covers that gap: instead of needing the file's bytes
		// at build time, it adds a manifest entry for it up front with a synthetic
		// revision (hashed from `_app/version.json`, which does exist by then), and
		// Workbox fetches the real content over the network during the service
		// worker's own install step, by which point the deployed 200.html exists.
		SvelteKitPWA({
			registerType: 'autoUpdate',
			injectRegister: null,
			manifest: pwaManifest,
			// `vite dev` has no static build to precache, and the SvelteKit
			// `spa`/`adapterFallback` + `navigateFallback` machinery targets
			// `200.html`, which doesn't exist in dev — it also collides with
			// vite-plugin-pwa's dev-mode navigateFallback entry (two `200.html`
			// entries with conflicting revisions). Drop the fallback machinery in
			// dev so `pnpm dev:sw` registers a worker without errors; it still
			// runtime-caches /api GETs via the shared runtimeCaching rules.
			workbox: devSW
				? {
						globPatterns: [],
						navigateFallback: undefined,
						runtimeCaching: workboxOptions.runtimeCaching
					}
				: workboxOptions,
			devOptions: {
				enabled: devSW,
				type: 'module'
			},
			kit: devSW
				? {}
				: {
						adapterFallback: '200.html',
						spa: true
					}
		})
	],
	server: {
		// EveryList dev binds fixed ports to avoid silently wedging onto the
		// wrong one: 5174 here (web) and 3334 for the API (PORT in
		// apps/api/.env.example). `strictPort` makes Vite fail loudly instead of
		// silently shifting to the next free port — `pnpm dev` runs a pre-flight
		// check (scripts/dev-preflight.mjs) that reports any conflict before that
		// happens. In production AdonisJS serves both the API and the static
		// build from one origin (see docker/Dockerfile), so the app fetches
		// relative "/api/..." paths. Dev runs SvelteKit and AdonisJS as separate
		// processes on separate ports, so proxy the same relative path to the
		// API dev server — VITE_API_PROXY_TARGET lets docker-compose point
		// this at the "api" service instead of localhost.
		port: 5174,
		strictPort: true,
		proxy: {
			'/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3334'
		}
	},
	// `vite preview` serves the production `build/` (with the real sw.js) — the
	// correct way to test offline/PWA behavior locally, since `vite dev` serves
	// modules dynamically and its dev SW can't precache the app shell. Mirror
	// the dev proxy so the API resolves against a running API dev server.
	preview: {
		port: 4173,
		strictPort: true,
		proxy: {
			'/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3334'
		}
	},
	test: {
		expect: { requireAssertions: true },
		coverage: {
			provider: 'v8',
			include: ['src/**/*.{ts,svelte}'],
			exclude: [
				'src/**/*.{test,spec}.{ts,js}',
				'src/**/*.svelte.{test,spec}.{ts,js}',
				'src/app.d.ts',
				// SvelteKit route config: two-line `export const prerender/ssr`
				// toggles and the root layout's favicon/slot wiring — framework
				// glue, not application logic (same rationale as apps/api's
				// .c8rc.json excluding its own framework bootstrap files).
				'src/routes/**/+page.ts',
				'src/routes/+layout.ts',
				'src/routes/+layout.svelte'
			],
			reporter: ['text'],
			thresholds: {
				lines: 100,
				branches: 100,
				functions: 100,
				statements: 100
			}
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright({ launchOptions: chromiumLaunchOptions }),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
