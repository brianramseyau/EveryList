import { describe, expect, it } from 'vitest';
import { filterSuggestions, mergeSuggestions } from './autocomplete';

describe('mergeSuggestions', () => {
	it('lists favorites before recent names', () => {
		const result = mergeSuggestions(['Bananas'], ['Bread']);
		expect(result).toEqual([
			{ name: 'Bananas', isFavorite: true },
			{ name: 'Bread', isFavorite: false }
		]);
	});

	it('dedupes case-insensitively/trimmed, preferring the favorite entry and its casing', () => {
		const result = mergeSuggestions(['Bananas'], ['  bananas  ', 'Bread']);
		expect(result).toEqual([
			{ name: 'Bananas', isFavorite: true },
			{ name: 'Bread', isFavorite: false }
		]);
	});

	it('dedupes within the favorites list itself', () => {
		const result = mergeSuggestions(['Bananas', 'bananas'], []);
		expect(result).toEqual([{ name: 'Bananas', isFavorite: true }]);
	});

	it('dedupes within the recent-names list itself', () => {
		const result = mergeSuggestions([], ['Milk', 'milk', 'Bread']);
		expect(result).toEqual([
			{ name: 'Milk', isFavorite: false },
			{ name: 'Bread', isFavorite: false }
		]);
	});
});

describe('filterSuggestions', () => {
	const suggestions = mergeSuggestions(['Bananas'], ['Bread', 'Butter']);

	it('returns nothing for an empty or whitespace-only query', () => {
		expect(filterSuggestions(suggestions, '')).toEqual([]);
		expect(filterSuggestions(suggestions, '   ')).toEqual([]);
	});

	it('matches case-insensitively by substring, not just prefix', () => {
		const result = filterSuggestions(suggestions, 'AN');
		expect(result).toEqual([{ name: 'Bananas', isFavorite: true }]);
	});

	it('caps results at the given limit', () => {
		const many = mergeSuggestions(
			[],
			Array.from({ length: 30 }, (_, i) => `Item ${i}`)
		);
		expect(filterSuggestions(many, 'Item', 5)).toHaveLength(5);
	});
});
