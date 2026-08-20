import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibility smoke pass (PLAN.md §13/§11): axe-core against an
 * unauthenticated page and a real, data-bearing authenticated page — see
 * PHASE7_PLAN.md §5. Runs against the same dev-server webServer setup as
 * offline-sync.e2e.ts, which already proxies /api/v1/* to a real API.
 */
test('login page has no automatically-detectable accessibility violations', async ({ page }) => {
	await page.goto('/login');
	await page.waitForLoadState('networkidle');

	const results = await new AxeBuilder({ page }).analyze();
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

	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
