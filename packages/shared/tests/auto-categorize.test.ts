import { describe, expect, it } from 'vitest';
import { suggestCategoryName } from '../src/auto-categorize.js';

describe('suggestCategoryName', () => {
	it('matches a keyword to its category', () => {
		expect(suggestCategoryName('Bananas')).toBe('Produce');
	});

	it('prefers the longer of two matching keywords when it is found later', () => {
		// "lime" (Produce) is checked before "cottage cheese" (Dairy); the longer,
		// later match should win the category, not the first one found.
		expect(suggestCategoryName('lime cottage cheese')).toBe('Dairy');
	});

	it('keeps the first match when a later, shorter keyword also matches', () => {
		// "vegetable" (Produce) is checked before "milk" (Dairy); the shorter,
		// later match should not override the longer first match.
		expect(suggestCategoryName('vegetable milk')).toBe('Produce');
	});

	it('returns null when nothing matches', () => {
		expect(suggestCategoryName('xyzzy nonsense')).toBeNull();
	});

	it('returns null for a blank name', () => {
		expect(suggestCategoryName('   ')).toBeNull();
	});
});
