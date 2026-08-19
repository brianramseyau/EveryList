// Dynamic list ids aren't known at build time, so this route can't be
// prerendered — see apps/web/src/routes/lists/[id]/+page.ts.
export const prerender = false;
export const ssr = false;
