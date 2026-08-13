// Dynamic list ids aren't known at build time, so this route can't be
// prerendered — served from the adapter-static SPA fallback instead (see
// vite.config.ts), with all its data fetched client-side.
export const prerender = false;
export const ssr = false;
