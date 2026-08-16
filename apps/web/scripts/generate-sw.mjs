// vite-plugin-pwa's `generateSW` mode writes the service worker from its
// `writeBundle` hook, which fires while Vite is still finishing the client
// build — *before* @sveltejs/adapter-static prerenders the app's HTML pages
// and copies them into `build/` (that happens in SvelteKit's own
// `closeBundle`, a later hook). So the sw.js the plugin ships precaches every
// JS/CSS/font/icon asset but zero HTML, including /200.html — the
// navigateFallback target every offline cold start depends on to boot the
// app shell without a network round trip. See vite.config.ts's VitePWA
// comment for the full timeline.
//
// This script re-runs the same caching config directly against the finished
// `build/` directory (after `vite build` — and adapter-static within it —
// has completed) and overwrites the plugin's incomplete sw.js with a correct
// one.
import { readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateSW } from 'workbox-build';
import { workboxOptions } from '../pwa.config.mjs';

const buildDir = fileURLToPath(new URL('../build/', import.meta.url));

await rm(new URL('../build/sw.js', import.meta.url), { force: true });
for (const entry of await readdir(buildDir)) {
	if (entry.startsWith('workbox-') && entry.endsWith('.js')) {
		await rm(new URL(`../build/${entry}`, import.meta.url), { force: true });
	}
}

const { count, size, warnings } = await generateSW({
	...workboxOptions,
	swDest: fileURLToPath(new URL('../build/sw.js', import.meta.url)),
	globDirectory: buildDir,
	// Bundle the workbox runtime into sw.js itself rather than a separate
	// workbox-<hash>.js chunk — one less file for this script to place/track.
	inlineWorkboxRuntime: true,
	skipWaiting: true,
	clientsClaim: true
});

for (const warning of warnings) console.warn(warning);
console.log(
	`generate-sw: precached ${count} files (${(size / 1024).toFixed(1)} KiB) into build/sw.js`
);
