import { describe, expect, it } from 'vitest';
import { searchIcons } from './search';

describe('searchIcons', () => {
	it('returns an empty array for a blank query', () => {
		expect(searchIcons(['zebra', 'cheese'], '   ')).toEqual([]);
	});

	it('ranks an exact label match above a longer name that merely starts with it', () => {
		expect(searchIcons(['zebra', 'zebraCrossing'], 'zebra')).toEqual(['zebra', 'zebraCrossing']);
	});

	it('ranks a whole-label prefix match above a word-boundary match', () => {
		expect(searchIcons(['carAlert', 'trafficCar'], 'car')).toEqual(['carAlert', 'trafficCar']);
	});

	it('matches a substring that falls inside a word, not just at its start', () => {
		expect(searchIcons(['bookmark', 'zebra'], 'kma')).toEqual(['bookmark']);
	});

	it('matches an icon via an aliased keyword the label itself never mentions', () => {
		// "cup" is aliased to "milk" (see ./aliases.ts) even though neither its
		// stored name nor its display label contains the word "milk".
		expect(searchIcons(['cup', 'zebra'], 'milk')).toEqual(['cup']);
	});

	it('falls back to a fuzzy subsequence match for a near-miss spelling', () => {
		expect(searchIcons(['cheese', 'basketball'], 'chse')).toEqual(['cheese']);
	});

	it('does not fuzzy-match a 1-2 character query, only a real prefix/substring', () => {
		// Almost every label contains "ar" as a scattered subsequence (e.g.
		// "camera"); fuzzy-matching those would make a short query a no-op
		// filter, so only a literal substring counts below 3 characters.
		expect(searchIcons(['camera', 'carAlert'], 'ar')).toEqual(['carAlert']);
	});

	it('excludes an icon with no match at all, even fuzzily', () => {
		expect(searchIcons(['cheese'], 'xyz')).toEqual([]);
	});

	it('breaks a same-tier score tie alphabetically', () => {
		expect(searchIcons(['zetaTag', 'alphaTag'], 'tag')).toEqual(['alphaTag', 'zetaTag']);
	});
});
