import { existsSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

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
		})
	],
	server: {
		// In production AdonisJS serves both the API and the static build from
		// one origin (see docker/Dockerfile), so the app fetches relative
		// "/api/..." paths. Dev runs SvelteKit and AdonisJS as separate
		// processes on separate ports, so proxy the same relative path to the
		// API dev server — VITE_API_PROXY_TARGET lets docker-compose point
		// this at the "api" service instead of localhost.
		proxy: {
			'/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3333'
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
