import { describe, expect, it } from 'vitest';
import { DEFAULT_ICONS, suggestedIcons } from './suggested';

describe('suggestedIcons', () => {
	const names = [...DEFAULT_ICONS, 'cheese', 'egg', 'cup', 'carrot'];

	it('leads with icons aliased to the hint and reports fromHint', () => {
		const result = suggestedIcons({ names, hint: 'Dairy', favorites: [] });
		expect(result.fromHint).toBe(true);
		expect(result.icons.slice(0, 3)).toEqual(['cheese', 'egg', 'cup']);
	});

	it('falls back to the plain defaults, not fromHint, when the hint matches nothing', () => {
		const result = suggestedIcons({ names, hint: 'Xyzzy', favorites: [] });
		expect(result.fromHint).toBe(false);
		expect(result.icons).toEqual(DEFAULT_ICONS);
	});

	it('falls back to the plain defaults for a blank hint', () => {
		const result = suggestedIcons({ names, hint: '', favorites: [] });
		expect(result.fromHint).toBe(false);
	});

	it('backfills with favorites (after any hint matches), skipping duplicates', () => {
		const result = suggestedIcons({ names, hint: '', favorites: ['carrot', 'cheese'] });
		expect(result.icons.slice(0, 2)).toEqual(['carrot', 'cheese']);
	});

	it('skips a hinted or favorite icon that is not in the loaded icon set', () => {
		const result = suggestedIcons({ names: ['cheese'], hint: 'Dairy', favorites: ['carrot'] });
		expect(result.icons).toEqual(['cheese']);
	});

	it('caps the result at the given limit', () => {
		const result = suggestedIcons({ names: DEFAULT_ICONS, hint: '', favorites: [], limit: 3 });
		expect(result.icons).toHaveLength(3);
	});
});
