import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

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
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
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
