import { expect, test } from '@playwright/test';

/**
 * End-to-end offline sync scenario (PLAN_05_PHASE_OFFLINE_PWA.md §7): a real signup against a real API,
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

	// Signup already seeds a starter "Shopping List" list (see PLAN_00_FOUNDATIONAL_PLAN.md's Phase 2
	// status note) — a distinct name avoids ambiguous locator matches.
	await page.getByRole('button', { name: 'Create' }).click();
	await page.getByRole('link', { name: 'Create List' }).click();
	await page.getByPlaceholder('List name').fill('Camping Trip');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.getByRole('link', { name: /Camping Trip/ }).click();
	await expect(page.getByText('Nothing here yet. Add your first item above.')).toBeVisible();

	await page.context().setOffline(true);

	// The connectivity monitor marks the server unavailable the moment the browser goes
	// offline, surfacing the disconnected-cloud icon (PLAN_14_PHASE_SYNC_STATUS_OBSERVABILITY.md).
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

/**
 * Reads (PLAN_13_PHASE_NATIVE_APP_SHELL.md §8) are a separate offline path from writes above: on native, there's
 * no service worker to fall back to a cached HTTP response, so a page's own fetch functions
 * (fetchList/fetchLists/etc.) need to fall back to Dexie themselves. A hard reload — not a
 * client-side nav — is what actually exercises this: it's the only thing that re-runs
 * onMount/loadAll from a cold start, the real native cold-launch-while-offline scenario.
 */
test('reloading a list while offline shows its cached content instead of a load error', async ({
	page
}) => {
	const email = `e2e-${Date.now()}@example.com`;

	await page.goto('/signup');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
	await page.getByLabel('Confirm password').fill('correct horse battery staple');
	await page.getByRole('button', { name: 'Sign up' }).click();

	await expect(page).toHaveURL(/\/lists$/);

	await page.getByRole('button', { name: 'Create' }).click();
	await page.getByRole('link', { name: 'Create List' }).click();
	await page.getByPlaceholder('List name').fill('Camping Trip');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.getByRole('link', { name: /Camping Trip/ }).click();
	await page.getByPlaceholder('Item name').fill('Tent');
	await page.getByPlaceholder('Item name').press('Enter');
	await expect(page.getByText('Tent')).toBeVisible();

	// A real online reload runs fetchList/fetchItems successfully, which is what actually
	// populates Dexie — the offline fallback below has nothing to serve without this.
	await page.reload();
	await expect(page.getByText('Tent')).toBeVisible();

	// `page.context().setOffline(true)` (used above) blocks the dev server's own page/JS
	// delivery too, not just API calls — accurate for the "add an item" scenario above (no
	// navigation happens while offline there), but wrong here: a native app's shell always
	// loads instantly from local files regardless of network state, only its API calls fail.
	// Blocking just `/api/v1/*` reproduces that precisely instead.
	await page.route('**/api/v1/**', (route) => route.abort());
	await page.reload();

	await expect(page.getByText('Camping Trip')).toBeVisible();
	await expect(page.getByText('Tent')).toBeVisible();
	await expect(page.getByText('Failed to load list.')).not.toBeVisible();

	await page.unroute('**/api/v1/**');
});
