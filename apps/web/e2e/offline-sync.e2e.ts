import { expect, test } from '@playwright/test';

/**
 * End-to-end offline sync scenario (PHASE5_PLAN.md §7): a real signup against a real API,
 * an item added while the browser is offline (optimistic render + the disconnected-cloud
 * icon), then reconnecting and confirming the flush loop drained the queue and the server
 * actually has the item once the page is reloaded from scratch.
 */
test('adds an item while offline and syncs it once back online', async ({ page }) => {
	const email = `e2e-${Date.now()}@example.com`;

	await page.goto('/signup');
	// `vite dev` compiles each route's module graph on first visit — without waiting for
	// that to settle, a click can land before Svelte's client-side listener attaches and
	// falls through to a native (unhandled) form submission instead.
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
	await page.getByLabel('Confirm password').fill('correct horse battery staple');
	await page.getByRole('button', { name: 'Sign up' }).click();

	await expect(page).toHaveURL(/\/lists$/);

	// Signup already seeds a starter "Shopping List" list (see PLAN.md's Phase 2
	// status note) — a distinct name avoids ambiguous locator matches.
	await page.getByRole('button', { name: 'Create' }).click();
	await page.getByRole('link', { name: 'Create List' }).click();
	await page.getByPlaceholder('List name').fill('Camping Trip');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.getByRole('link', { name: /Camping Trip/ }).click();
	await expect(page.getByText('Nothing here yet. Add your first item above.')).toBeVisible();

	await page.context().setOffline(true);

	// The connectivity monitor marks the server unavailable the moment the browser goes
	// offline, surfacing the disconnected-cloud icon (PHASE14_PLAN.md).
	await expect(page.getByRole('link', { name: /Server unavailable/ })).toBeVisible();

	await page.getByPlaceholder('Item name').fill('Milk');
	await page.getByPlaceholder('Item name').press('Enter');

	// Optimistic render happens immediately, entirely from the Dexie-backed write path —
	// no network request has succeeded yet.
	await expect(page.getByText('Milk')).toBeVisible();

	await page.context().setOffline(false);

	// The flush loop's `online` listener drains the queue; the disconnected-cloud icon
	// clears once the server is reachable again.
	await expect(page.getByRole('link', { name: /Server unavailable/ })).not.toBeVisible({
		timeout: 15_000
	});

	await page.reload();
	await expect(page.getByText('Milk')).toBeVisible();

	// The dedicated sync-status page shows an empty queue after the drain.
	await page.goto('/settings/sync');
	await expect(page.getByText('Everything is synced', { exact: false })).toBeVisible();
});
