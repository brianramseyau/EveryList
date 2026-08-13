import { describe, expect, it } from 'vitest';
import { fromMdiExportName, loadMdiIcons, toDisplayLabel, toMdiExportName } from './mdi';

describe('mdi icon name helpers', () => {
	it('converts a stored icon name to its @mdi/js export name', () => {
		expect(toMdiExportName('fruitCherries')).toBe('mdiFruitCherries');
		expect(toMdiExportName('cheese')).toBe('mdiCheese');
	});

	it('converts an @mdi/js export name back to the stored icon name', () => {
		expect(fromMdiExportName('mdiFruitCherries')).toBe('fruitCherries');
		expect(fromMdiExportName('mdiCheese')).toBe('cheese');
	});

	it('formats a stored icon name into a human-readable label', () => {
		expect(toDisplayLabel('fruitCherries')).toBe('Fruit Cherries');
		expect(toDisplayLabel('dotsHorizontalCircle')).toBe('Dots Horizontal Circle');
		expect(toDisplayLabel('cheese')).toBe('Cheese');
	});
});

describe('loadMdiIcons', () => {
	it('resolves real path data for known seeded category icons', async () => {
		const icons = await loadMdiIcons();

		for (const iconName of ['fruitCherries', 'cheese', 'foodDrumstick', 'breadSlice']) {
			const path = icons[toMdiExportName(iconName)];
			expect(path).toBeTypeOf('string');
			expect(path!.length).toBeGreaterThan(0);
		}
	});

	it('caches the module so it is only imported once', async () => {
		const first = await loadMdiIcons();
		const second = await loadMdiIcons();
		expect(first).toBe(second);
	});
});
