import { expect, test } from '@playwright/test';

/**
 * The dirty-navigation guard (createDirtyGuard, see $lib/dirty-guard.svelte.ts): edited but
 * unsaved item fields must not be silently lost by tapping the back arrow — the user is
 * prompted to discard or stay, matching the same pattern for the paste-items screen.
 */
test('prompts before discarding an unsaved item edit, and keeps the draft on cancel', async ({
	page
}) => {
	const email = `e2e-unsaved-item-${Date.now()}@example.com`;
	const patchRequests: string[] = [];
	page.on('request', (request) => {
		if (request.method() === 'PATCH') patchRequests.push(request.url());
	});

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

	await page.getByRole('link', { name: 'Edit Tent' }).click();
	await expect(page).toHaveURL(/\/items\/\d+$/);

	await page.getByLabel('Notes').fill('Check the poles are all there');

	// Tapping back with an edited-but-unsaved draft must not navigate away silently.
	await page.getByRole('link', { name: 'Back to list' }).click();
	await expect(
		page.getByText('You have unsaved changes to this item. Discard them?')
	).toBeVisible();
	await expect(page).toHaveURL(/\/items\/\d+$/);

	// Cancel keeps the draft in place.
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByLabel('Notes')).toHaveValue('Check the poles are all there');

	// Discard actually leaves, and the unsaved edit never reaches the server.
	await page.getByRole('link', { name: 'Back to list' }).click();
	await page.getByRole('button', { name: 'Discard' }).click();
	await expect(page).toHaveURL(/\/lists\/\d+$/);

	await page.getByRole('link', { name: 'Edit Tent' }).click();
	await expect(page.getByLabel('Notes')).toHaveValue('');
	expect(patchRequests).toHaveLength(0);
});

test('prompts before discarding unsaved pasted items', async ({ page }) => {
	const email = `e2e-unsaved-paste-${Date.now()}@example.com`;

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

	await page.getByPlaceholder('Item name').click();
	await page.getByRole('link', { name: 'Paste in a list' }).click();
	await expect(page).toHaveURL(/\/import$/);

	await page.getByPlaceholder('One item per line, or paste an AnyList list').fill('Milk\nEggs');

	await page.getByRole('link', { name: 'Cancel' }).click();
	await expect(page.getByText('You have unsaved pasted items. Discard them?')).toBeVisible();

	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByPlaceholder('One item per line, or paste an AnyList list')).toHaveValue(
		'Milk\nEggs'
	);
});
