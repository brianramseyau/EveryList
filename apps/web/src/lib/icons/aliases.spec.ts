import { describe, expect, it } from 'vitest';
import { ICON_ALIASES, getIconKeywords, hintedIcons } from './aliases';

describe('ICON_ALIASES', () => {
	it('has no empty keyword or icon-name entries', () => {
		for (const [keyword, icons] of Object.entries(ICON_ALIASES)) {
			expect(keyword.length).toBeGreaterThan(0);
			expect(icons.length).toBeGreaterThan(0);
			for (const icon of icons) expect(icon.length).toBeGreaterThan(0);
		}
	});
});

describe('getIconKeywords', () => {
	it('returns every keyword aliased to an icon', () => {
		expect(getIconKeywords('cup')).toEqual(
			expect.arrayContaining(['dairy', 'milk', 'yogurt', 'drink'])
		);
	});

	it('returns an empty array for an icon with no aliases', () => {
		expect(getIconKeywords('abTesting')).toEqual([]);
	});
});

describe('hintedIcons', () => {
	it('matches a whole word in the hint', () => {
		expect(hintedIcons('Dairy')).toEqual(['cheese', 'egg', 'cup']);
	});

	it('matches every word in a multi-word hint', () => {
		const icons = hintedIcons('Fresh Fruit and Vegetables');
		expect(icons).toEqual(expect.arrayContaining(['fruitCherries', 'carrot']));
	});

	it('falls back to a naive singular for a plural word not itself a key', () => {
		// "meats" isn't a dictionary key, but its singular "meat" is.
		expect(hintedIcons('Meats')).toEqual(['foodDrumstick', 'foodSteak']);
	});

	it('does not attempt a singular fallback for a short word ending in "s"', () => {
		// "abs" is 3 characters, at the length guard's boundary, and isn't a
		// key itself — should not be treated as a plural of "ab".
		expect(hintedIcons('abs')).toEqual([]);
	});

	it('returns an empty array when nothing in the hint matches', () => {
		expect(hintedIcons('Xyzzy')).toEqual([]);
	});

	it('returns an empty array for a blank hint', () => {
		expect(hintedIcons('')).toEqual([]);
	});
});
