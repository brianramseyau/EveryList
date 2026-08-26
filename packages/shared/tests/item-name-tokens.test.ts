import { describe, expect, it } from 'vitest';
import { normalizeItemName, tokenizeItemName } from '../src/item-name-tokens.js';

describe('normalizeItemName', () => {
	it('lowercases and trims', () => {
		expect(normalizeItemName('  Apple  ')).toBe('apple');
	});

	it('strips accents via Unicode normalization', () => {
		expect(normalizeItemName('Café')).toBe('cafe');
	});

	it('strips punctuation and collapses whitespace', () => {
		expect(normalizeItemName("2%  Milk's\t1 gal")).toBe('2 milk s 1 gal');
	});

	it('returns an empty string for a blank name', () => {
		expect(normalizeItemName('   ')).toBe('');
	});
});

describe('tokenizeItemName', () => {
	it('returns an empty array for a blank name', () => {
		expect(tokenizeItemName('   ')).toEqual([]);
	});

	it('collapses singular and simple-plural onto the same token', () => {
		expect(tokenizeItemName('Apple')).toEqual(['apple']);
		expect(tokenizeItemName('Apples')).toEqual(['apple']);
	});

	it('strips the consonant+y "ies" plural', () => {
		expect(tokenizeItemName('Berries')).toEqual(['berry']);
	});

	it('strips the s/x/z/ch/sh "es" plural', () => {
		expect(tokenizeItemName('Boxes')).toEqual(['box']);
		expect(tokenizeItemName('Dishes')).toEqual(['dish']);
	});

	it('strips the "-o → -oes" plural', () => {
		expect(tokenizeItemName('Tomatoes')).toEqual(['tomato']);
	});

	it('does not mistake a trailing "es" for a plural when the stem ends in a consonant', () => {
		expect(tokenizeItemName('Apples')).toEqual(['apple']);
	});

	it('keeps words ending in "ss" intact', () => {
		expect(tokenizeItemName('Glass')).toEqual(['glass']);
	});

	it('drops tokens that contain no letters', () => {
		expect(tokenizeItemName('2% milk')).toEqual(['milk']);
		expect(tokenizeItemName('123')).toEqual([]);
	});

	it('keeps digits only when a token also contains a letter', () => {
		expect(tokenizeItemName('Milk 1 gal')).toEqual(['milk', 'gal']);
	});

	it('de-duplicates repeated tokens', () => {
		expect(tokenizeItemName('milk and milk')).toEqual(['milk', 'and']);
	});
});
