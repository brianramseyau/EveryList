// Needs a live check against the API (is setup still needed?) and posts directly to it, so this
// route can't be prerendered — served from the adapter-static SPA fallback instead, matching
// every other route that talks to the live API (see settings/backups/+page.ts).
export const prerender = false;
export const ssr = false;
