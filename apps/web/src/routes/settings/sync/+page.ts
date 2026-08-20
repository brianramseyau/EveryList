// Reads the offline sync queue from IndexedDB client-side, so this route can't
// be prerendered — served from the adapter-static SPA fallback instead.
export const prerender = false;
export const ssr = false;
