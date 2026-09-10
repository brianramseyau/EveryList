// Shared between playwright.config.ts (which starts the webServer processes) and
// global-setup.ts (which talks to the already-running API directly, before any test
// file's own page.goto touches it) — kept in one place so the two can't drift apart.
export const API_PORT = 3335;
export const WEB_PORT = 5175;
