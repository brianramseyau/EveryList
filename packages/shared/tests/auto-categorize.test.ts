import { describe, expect, it } from 'vitest';
import {
  DECAY_FLOOR,
  HALF_LIFE_MS,
  MARGIN,
  pickLearnedCategoryId,
  rankCategoryLearnings,
  suggestCategoryName,
} from '../src/auto-categorize.js';

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

describe('learned category ranking', () => {
	const NOW = 1_800_000_000_000;
	const DAY = 24 * 60 * 60 * 1000;

	it('exposes the tuning constants', () => {
		expect(HALF_LIFE_MS).toBe(180 * DAY);
		expect(DECAY_FLOOR).toBe(0.05);
		expect(MARGIN).toBe(2);
	});

	it('sums decay-weighted counts per category across matching tokens only', () => {
		const ranked = rankCategoryLearnings(
			['apple', 'banana'],
			[
				{ categoryId: 1, token: 'apple', count: 2, lastSeenAt: NOW },
				{ categoryId: 1, token: 'banana', count: 1, lastSeenAt: NOW },
				{ categoryId: 2, token: 'apple', count: 1, lastSeenAt: NOW },
				{ categoryId: 3, token: 'carrot', count: 5, lastSeenAt: NOW },
			],
			NOW
		);

		// "apple" is spread across two categories, so its contributions are halved:
		// category 1 scores (2 / 2) + (1 / 1), category 2 scores 1 / 2.
		expect(ranked).toEqual([
			{ categoryId: 1, score: 2, lastSeenAt: NOW },
			{ categoryId: 2, score: 0.5, lastSeenAt: NOW },
		]);
	});

	it('weights a distinctive token above one spread across several categories', () => {
		const ranked = rankCategoryLearnings(
			['peckish', 'rice', 'cracker'],
			[
				{ categoryId: 1, token: 'peckish', count: 1, lastSeenAt: NOW },
				{ categoryId: 1, token: 'rice', count: 1, lastSeenAt: NOW },
				{ categoryId: 1, token: 'cracker', count: 1, lastSeenAt: NOW },
				{ categoryId: 2, token: 'rice', count: 1, lastSeenAt: NOW },
				{ categoryId: 2, token: 'cracker', count: 1, lastSeenAt: NOW },
				{ categoryId: 3, token: 'rice', count: 1, lastSeenAt: NOW },
			],
			NOW
		);

		// df: peckish = 1, cracker = 2, rice = 3.
		expect(ranked[0]!.categoryId).toBe(1);
		expect(ranked[0]!.score).toBeCloseTo(1 + 1 / 2 + 1 / 3);
		expect(ranked[1]!.score).toBeCloseTo(1 / 2 + 1 / 3);
	});

	it('counts a token\'s df by distinct categories, not rows', () => {
		const ranked = rankCategoryLearnings(
			['apple'],
			[
				{ categoryId: 1, token: 'apple', count: 1, lastSeenAt: NOW },
				{ categoryId: 1, token: 'apple', count: 1, lastSeenAt: NOW },
				{ categoryId: 2, token: 'apple', count: 1, lastSeenAt: NOW },
			],
			NOW
		);

		// Two categories, so both contributions are halved — the duplicate row
		// must not make it look like a three-category spread.
		expect(ranked).toEqual([
			{ categoryId: 1, score: 1, lastSeenAt: NOW },
			{ categoryId: 2, score: 0.5, lastSeenAt: NOW },
		]);
	});

	it('accepts ISO-string lastSeenAt values', () => {
		const iso = new Date(NOW).toISOString();
		const ranked = rankCategoryLearnings(
			['apple'],
			[{ categoryId: 1, token: 'apple', count: 1, lastSeenAt: iso }],
			NOW
		);

		expect(ranked).toEqual([{ categoryId: 1, score: 1, lastSeenAt: NOW }]);
	});

	it('carries a category\'s most recent lastSeenAt forward across its tokens', () => {
		const ranked = rankCategoryLearnings(
			['apple', 'banana'],
			[
				{ categoryId: 1, token: 'apple', count: 1, lastSeenAt: NOW - DAY },
				{ categoryId: 1, token: 'banana', count: 1, lastSeenAt: NOW },
			],
			NOW
		);

		expect(ranked).toEqual([{ categoryId: 1, score: expect.any(Number), lastSeenAt: NOW }]);
	});

	it('decays older associations so a fresher one ranks first', () => {
		const ranked = rankCategoryLearnings(
			['apple'],
			[
				{ categoryId: 1, token: 'apple', count: 1, lastSeenAt: NOW - 180 * DAY },
				{ categoryId: 2, token: 'apple', count: 1, lastSeenAt: NOW },
			],
			NOW
		);

		expect(ranked.map((entry) => entry.categoryId)).toEqual([2, 1]);
		// One half-life of age halves the weight; "apple" is also halved by its
		// two-category spread, so the older association scores 0.25.
		expect(ranked[1]!.score).toBeCloseTo(0.25);
	});

	it('breaks a score tie by the most recent lastSeenAt', () => {
		// Both fully decayed to the floor, so their scores are equal.
		const ranked = rankCategoryLearnings(
			['apple'],
			[
				{ categoryId: 1, token: 'apple', count: 1, lastSeenAt: NOW - 1000 * DAY },
				{ categoryId: 2, token: 'apple', count: 1, lastSeenAt: NOW - 900 * DAY },
			],
			NOW
		);

		expect(ranked.map((entry) => entry.categoryId)).toEqual([2, 1]);
	});

	it('returns an empty ranking when nothing matches', () => {
		expect(
			rankCategoryLearnings(['carrot'], [{ categoryId: 1, token: 'apple', count: 1, lastSeenAt: NOW }], NOW)
		).toEqual([]);
	});
});

describe('pickLearnedCategoryId', () => {
	const NOW = 1_800_000_000_000;
	const DAY = 24 * 60 * 60 * 1000;

	it('returns null when there are no learnings at all', () => {
		expect(pickLearnedCategoryId(['apple'], [], NOW)).toBeNull();
	});

	it('returns null when no token matches', () => {
		expect(
			pickLearnedCategoryId(
				['carrot'],
				[{ categoryId: 1, token: 'apple', count: 1, lastSeenAt: NOW }],
				NOW
			)
		).toBeNull();
	});

	it('returns an uncontested category regardless of decay', () => {
		expect(
			pickLearnedCategoryId(
				['apple'],
				[{ categoryId: 7, token: 'apple', count: 1, lastSeenAt: NOW - 1000 * DAY }],
				NOW
			)
		).toBe(7);
	});

	it('inherits a shorter matched name\'s category despite common-token spread (Peckish regression)', () => {
		// Mirrors the reported production rows for list 1: "peckish"/"cracker"/
		// "rice" all once meant Cookies & Biscuits ("Peckish rice crackers"), but
		// "rice" has since been assigned to four other categories. Without
		// distinctiveness weighting the runner-up blocks the 2× margin.
		const learnings = [
			{ categoryId: 1, token: 'peckish', count: 1, lastSeenAt: NOW - 66 * DAY },
			{ categoryId: 1, token: 'cracker', count: 3, lastSeenAt: NOW - 28 * DAY },
			{ categoryId: 1, token: 'rice', count: 1, lastSeenAt: NOW - 66 * DAY },
			{ categoryId: 2, token: 'rice', count: 3, lastSeenAt: NOW - 32 * DAY },
			{ categoryId: 3, token: 'rice', count: 2, lastSeenAt: NOW - 32 * DAY },
			{ categoryId: 4, token: 'cracker', count: 1, lastSeenAt: NOW - 71 * DAY },
			{ categoryId: 4, token: 'rice', count: 1, lastSeenAt: NOW - 71 * DAY },
			{ categoryId: 5, token: 'rice', count: 1, lastSeenAt: NOW - 52 * DAY },
		];

		expect(pickLearnedCategoryId(['peckish', 'rice', 'cracker', 'original'], learnings, NOW)).toBe(
			1
		);
		// A trailing unmatched word must not change the outcome either.
		expect(
			pickLearnedCategoryId(['peckish', 'rice', 'cracker', 'plain'], learnings, NOW)
		).toBe(1);
	});

	it('returns the top category when it beats the runner-up by MARGIN', () => {
		expect(
			pickLearnedCategoryId(
				['apple'],
				[
					{ categoryId: 1, token: 'apple', count: 4, lastSeenAt: NOW },
					{ categoryId: 2, token: 'apple', count: 1, lastSeenAt: NOW },
				],
				NOW
			)
		).toBe(1);
	});

	it('returns null when two categories are within MARGIN (contested)', () => {
		expect(
			pickLearnedCategoryId(
				['apple'],
				[
					{ categoryId: 1, token: 'apple', count: 3, lastSeenAt: NOW },
					{ categoryId: 2, token: 'apple', count: 2, lastSeenAt: NOW },
				],
				NOW
			)
		).toBeNull();
	});
});
