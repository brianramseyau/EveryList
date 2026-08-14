import { expect, test } from '@playwright/test';

/**
 * End-to-end offline sync scenario (PHASE5_PLAN.md §7): a real signup against a real API,
 * an item added while the browser is offline (optimistic render + a pending count in the sync
 * banner), then reconnecting and confirming the flush loop drained the queue and the server
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

	await page.getByPlaceholder('New list name').fill('Groceries');
	await page.getByRole('button', { name: 'Add' }).click();
	await page.getByRole('link', { name: /Groceries/ }).click();
	await expect(page.getByText('No items yet — add one above.')).toBeVisible();

	await page.context().setOffline(true);

	await page.getByPlaceholder('Item name').fill('Milk');
	await page.getByRole('button', { name: 'Add' }).click();

	// Optimistic render happens immediately, entirely from the Dexie-backed write path —
	// no network request has succeeded yet.
	await expect(page.getByText('Milk')).toBeVisible();
	await expect(page.getByText(/change.*syncing|waiting to sync/)).toBeVisible();

	await page.context().setOffline(false);

	// The flush loop's `online` listener drains the queue; the banner disappears once
	// queueCounts() reports nothing pending.
	await expect(page.getByText(/change.*syncing|waiting to sync/)).not.toBeVisible({
		timeout: 15_000
	});

	await page.reload();
	await expect(page.getByText('Milk')).toBeVisible();
});
