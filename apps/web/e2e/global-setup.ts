import { API_PORT } from './ports';

const API_BASE = `http://localhost:${API_PORT}`;

/**
 * Every E2E spec signs up its own throwaway user against a real API (see e.g.
 * offline-sync.e2e.ts) — but since routes/+layout.svelte now redirects a logged-out visitor
 * away from /signup to /setup on an instance with no users yet (see routes/setup/+page.svelte),
 * the very first signup in a fresh e2e.sqlite3 would otherwise race that redirect. Complete
 * the first-run setup wizard once here, before any spec's page.goto('/signup') runs, so every
 * spec always lands on a real signup form.
 */
export default async function globalSetup() {
	const status = await (await fetch(`${API_BASE}/api/v1/setup/status`)).json();
	if (!status.data.needsSetup) return;

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
	if (!response.ok) {
		throw new Error(`E2E global setup failed: POST /api/v1/setup returned ${response.status}`);
	}
}
