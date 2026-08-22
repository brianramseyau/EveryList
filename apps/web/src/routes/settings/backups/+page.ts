// Needs a live bearer token from localStorage and hits the API directly, so
// this route can't be prerendered — served from the adapter-static SPA
// fallback instead, matching every other authenticated settings sub-page.
export const prerender = false;
export const ssr = false;
