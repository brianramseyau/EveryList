import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibility smoke pass (PLAN_00_FOUNDATIONAL_PLAN.md §13/§11): axe-core against an
 * unauthenticated page and a real, data-bearing authenticated page — see
 * PLAN_07_PHASE_POLISH.md §5. Runs against the same dev-server webServer setup as
 * offline-sync.e2e.ts, which already proxies /api/v1/* to a real API.
 */

// The app deliberately disables pinch-zoom everywhere (see $lib/pinch-zoom.ts, PR #52/#53,
// predating this app.html change) for an app-like feel rather than a zoomable web page — a
// pre-existing, accepted trade-off against WCAG 1.4.4, just never previously visible to axe's
// static meta-viewport check, since the zoom blocking was JS/touch-action-driven, not declared
// in the tag itself. `maximum-scale=1` (app.html, PLAN_13_PHASE_NATIVE_APP_SHELL.md §4's WebKit auto-zoom fix)
// makes that same existing behavior visible to axe for the first time; it isn't a new regression.
const disabledRules = ['meta-viewport'];

test('login page has no automatically-detectable accessibility violations', async ({ page }) => {
	await page.goto('/login');
	await page.waitForLoadState('networkidle');

	const results = await new AxeBuilder({ page }).disableRules(disabledRules).analyze();
	expect(results.violations).toEqual([]);
});

test('list detail page has no automatically-detectable accessibility violations', async ({
	page
}) => {
	const email = `e2e-a11y-${Date.now()}@example.com`;

	await page.goto('/signup');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
	await page.getByLabel('Confirm password').fill('correct horse battery staple');
	await page.getByRole('button', { name: 'Sign up' }).click();
	await expect(page).toHaveURL(/\/lists$/);

	// Signup already seeds a starter "Shopping List" list — open it directly
	// rather than creating another, so this page has real content on it.
	await page.getByRole('link', { name: /Shopping List/ }).click();
	await page.getByPlaceholder('Item name').fill('Milk');
	await page.getByPlaceholder('Item name').press('Enter');
	await expect(page.getByText('Milk')).toBeVisible();

	const results = await new AxeBuilder({ page }).disableRules(disabledRules).analyze();
	expect(results.violations).toEqual([]);
});
