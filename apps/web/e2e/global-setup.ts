import { API_PORT } from './ports';

const API_BASE = `http://localhost:${API_PORT}`;

/**
 * Every E2E spec signs up its own throwaway user against a real API (see e.g.
 * offline-sync.e2e.ts) — but since routes/+layout.svelte now redirects a logged-out visitor
 * away from /signup to /setup on an instance with no users yet (see routes/setup/+page.svelte),
 * the very first signup in a fresh e2e.sqlite3 would otherwise race that redirect. Complete
 * the first-run setup wizard once here, before any spec's page.goto('/signup') runs, so every
 * spec always lands on a real signup form.
 *
 * Playwright starts the `webServer` array (playwright.config.ts) before running this function,
 * so the API is normally already listening by the time it's called — but retries with backoff
 * regardless, since upstream has occasionally reported globalSetup racing webServer startup
 * (see e.g. microsoft/playwright#19571). A bare `fetch` failing outright (rather than every
 * retry being exhausted) is the actual startup race this guards against.
 */
export default async function globalSetup() {
	const status = await withRetries(async () => {
		const response = await fetch(`${API_BASE}/api/v1/setup/status`);
		if (!response.ok) throw new Error(`GET /api/v1/setup/status returned ${response.status}`);
		return response.json();
	});
	if (!status.data.needsSetup) return;

	await withRetries(async () => {
		const response = await fetch(`${API_BASE}/api/v1/setup`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				fullName: 'E2E Owner',
				email: 'e2e-owner@example.com',
				password: 'correct horse battery staple',
				passwordConfirmation: 'correct horse battery staple',
				backup: { frequency: 'weekly', timeOfDay: '03:00', retentionCount: 4 }
			})
		});
		// A 409 means another worker's globalSetup (or a stale server from a previous run) beat
		// this one to it — setup is done either way, so treat it as success rather than retrying.
		// Any other non-2xx (including a transient 5xx during the startup window) is retried the
		// same way the status check above retries one, instead of failing the whole run outright.
		if (!response.ok && response.status !== 409) {
			throw new Error(`POST /api/v1/setup returned ${response.status}`);
		}
	});
}

async function withRetries<T>(attempt: () => Promise<T>): Promise<T> {
	const maxAttempts = 5;
	for (let i = 1; i <= maxAttempts; i++) {
		try {
			return await attempt();
		} catch (error) {
			if (i === maxAttempts) throw error;
			await new Promise((r) => setTimeout(r, 500 * i));
		}
	}
	// Unreachable — the loop above always either returns or throws on its final attempt.
	throw new Error('unreachable');
}
