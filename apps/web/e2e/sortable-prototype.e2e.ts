import { expect, test } from '@playwright/test';

// Throwaway smoke test for the SortableJS reorder prototype — not part of the
// permanent suite. Confirms the swap actually drags in a real browser before
// deciding whether to roll it out for real.
test('drags an item across category sections with a real mouse gesture', async ({ page }) => {
	const email = `e2e-sortable-${Date.now()}@example.com`;

	await page.goto('/signup');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
	await page.getByLabel('Confirm password').fill('correct horse battery staple');
	await page.getByRole('button', { name: 'Sign up' }).click();
	await expect(page).toHaveURL(/\/lists$/);

	await page.getByRole('button', { name: 'Create' }).click();
	await page.getByRole('link', { name: 'Create List' }).click();
	await page.getByPlaceholder('List name').fill('Sortable Test');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.getByRole('link', { name: /Sortable Test/ }).click();
	await expect(page.getByText('Nothing here yet. Add your first item above.')).toBeVisible();

	const listUrl = page.url();

	await page.goto(`${listUrl}/categories`);
	await page.getByRole('button', { name: 'Create' }).click();
	await page.getByRole('link', { name: 'Create' }).click();
	await page.getByPlaceholder('Category name').fill('Zzyzx Section');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('list').getByRole('textbox')).toHaveValue('Zzyzx Section');

	await page.goto(listUrl);
	await page.getByPlaceholder('Item name').fill('Qwerpo Item');
	await page.getByPlaceholder('Item name').press('Enter');
	await expect(page.getByText('Qwerpo Item')).toBeVisible();
	await page.getByPlaceholder('Item name').fill('Vexnal Item');
	await page.getByPlaceholder('Item name').press('Enter');
	await expect(page.getByText('Vexnal Item')).toBeVisible();

	// A category section with zero items doesn't render at all (existing
	// behavior, not a SortableJS artifact — see `groups` in +page.svelte) —
	// seed one item into "Zzyzx Section" via its edit page so the section
	// actually shows up as a drop target.
	await page.getByRole('link', { name: 'Edit Vexnal Item' }).click();
	await page.getByLabel('Category').selectOption({ label: 'Zzyzx Section' });
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page).toHaveURL(listUrl);
	await expect(page.getByText('Uncategorized')).toBeVisible();

	// Drag onto the destination row itself, not the section heading — the
	// heading sits outside the `<ul>` SortableJS manages, so hovering it
	// never registers as entering that list.
	const dragged = page.getByText('Qwerpo Item');
	const target = page.getByText('Vexnal Item');

	// Page-transition animations (SvelteKit's View Transitions integration —
	// see the html element's data-nav-direction attribute) can leave
	// elementFromPoint hit-testing against a transition pseudo-layer for a
	// beat after navigation; wait them out before trusting coordinates.
	await page.waitForFunction(() => document.getAnimations().length === 0);

	const draggedBox = (await dragged.boundingBox())!;
	const targetBox = (await target.boundingBox())!;

	await page.mouse.move(draggedBox.x + draggedBox.width / 2, draggedBox.y + draggedBox.height / 2);
	await page.mouse.down();
	// Reorders are press-and-hold (400ms delay) on every pointer, so hold
	// still long enough for the drag to arm before moving.
	await page.waitForTimeout(450);
	// Fine-grained, multi-step moves — SortableJS's fallback drag tracks
	// position via mousemove, so a single big jump (or too few interpolated
	// steps) never gives it a chance to register the hover-over-target-list
	// swap logic.
	await page.mouse.move(draggedBox.x + draggedBox.width / 2, (draggedBox.y + targetBox.y) / 2, {
		steps: 20
	});
	await page.waitForTimeout(50);
	await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
		steps: 20
	});
	await page.waitForTimeout(50);
	await page.mouse.up();
	await page.waitForTimeout(300);

	const zzyzxSection = page.locator('section', { hasText: 'Zzyzx Section' });
	await expect(zzyzxSection.getByText('Qwerpo Item')).toBeVisible({ timeout: 10_000 });

	await page.reload();
	await expect(zzyzxSection.getByText('Qwerpo Item')).toBeVisible({ timeout: 10_000 });
});

// Reproduces the sortOrder-collision bug directly: every item gets its
// sortOrder from an ever-increasing per-list counter at creation
// (nextSortOrder in items_controller.ts), so 4 items created in a row land
// at 0,1,2,3. The old drag handler overwrote only the dragged item's
// sortOrder with its flat visible-list position — colliding with whatever
// item already held that value — so a second reorder could silently revert
// part of the first one on reload. This drags twice in the same list and
// checks the full order survives a reload after each step.
test('keeps a multi-step same-category reorder stable across reloads', async ({ page }) => {
	async function dragRowOnto(
		page: import('@playwright/test').Page,
		fromText: string,
		ontoText: string
	) {
		const from = page.getByText(fromText, { exact: true });
		const onto = page.getByText(ontoText, { exact: true });
		await page.waitForFunction(() => document.getAnimations().length === 0);
		const fromBox = (await from.boundingBox())!;
		const ontoBox = (await onto.boundingBox())!;
		await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
		await page.mouse.down();
		// Reorders are press-and-hold (400ms delay) on every pointer, so hold
		// still long enough for the drag to arm before moving.
		await page.waitForTimeout(450);
		await page.mouse.move(fromBox.x + fromBox.width / 2, (fromBox.y + ontoBox.y) / 2, {
			steps: 20
		});
		await page.waitForTimeout(50);
		await page.mouse.move(ontoBox.x + ontoBox.width / 2, ontoBox.y + ontoBox.height / 2, {
			steps: 20
		});
		await page.waitForTimeout(50);
		await page.mouse.up();
		await page.waitForTimeout(300);
	}

	const email = `e2e-sortable-multi-${Date.now()}@example.com`;

	await page.goto('/signup');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill('correct horse battery staple');
	await page.getByLabel('Confirm password').fill('correct horse battery staple');
	await page.getByRole('button', { name: 'Sign up' }).click();
	await expect(page).toHaveURL(/\/lists$/);

	await page.getByRole('button', { name: 'Create' }).click();
	await page.getByRole('link', { name: 'Create List' }).click();
	await page.getByPlaceholder('List name').fill('Sortable Multi Test');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.getByRole('link', { name: /Sortable Multi Test/ }).click();
	await expect(page.getByText('Nothing here yet. Add your first item above.')).toBeVisible();

	for (const name of ['Alpha Item', 'Bravo Item', 'Charlie Item', 'Delta Item']) {
		await page.getByPlaceholder('Item name').fill(name);
		await page.getByPlaceholder('Item name').press('Enter');
		await expect(page.getByText(name, { exact: true })).toBeVisible();
	}

	const rowOrder = () =>
		page
			.locator('li')
			.evaluateAll((rows) =>
				rows.map((row) => row.querySelector('.item-name span')?.textContent?.trim())
			);

	// Starts Alpha, Bravo, Charlie, Delta (creation order). Drag Delta above
	// Bravo: Alpha, Delta, Bravo, Charlie.
	await dragRowOnto(page, 'Delta Item', 'Bravo Item');
	await page.reload();
	await expect(page.getByText('Delta Item', { exact: true })).toBeVisible();
	let order = await rowOrder();
	expect(order.indexOf('Delta Item')).toBeLessThan(order.indexOf('Bravo Item'));
	expect(order.indexOf('Alpha Item')).toBeLessThan(order.indexOf('Delta Item'));

	// Now drag Charlie above Delta: Alpha, Charlie, Delta, Bravo. This is the
	// step that used to collide — Charlie's flat position (index 1) equaled
	// Delta's post-first-drag sortOrder, so ties made the final order
	// unpredictable on reload.
	await dragRowOnto(page, 'Charlie Item', 'Delta Item');
	await page.reload();
	await expect(page.getByText('Charlie Item', { exact: true })).toBeVisible();
	order = await rowOrder();
	expect(order.indexOf('Alpha Item')).toBeLessThan(order.indexOf('Charlie Item'));
	expect(order.indexOf('Charlie Item')).toBeLessThan(order.indexOf('Delta Item'));
	expect(order.indexOf('Delta Item')).toBeLessThan(order.indexOf('Bravo Item'));
});
