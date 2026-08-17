import { describe, expect, it } from 'vitest';
import { computeMidpointSortOrder } from './item-sort-order';

describe('computeMidpointSortOrder', () => {
	it('lands between two existing neighbors', () => {
		expect(computeMidpointSortOrder(1, 3)).toBe(2);
		expect(computeMidpointSortOrder(1, 2)).toBe(1.5);
	});

	it('never collides with either neighbor, even repeatedly bisecting the same gap', () => {
		const before = 1;
		let after = 2;
		for (let i = 0; i < 10; i++) {
			const mid = computeMidpointSortOrder(before, after);
			expect(mid).toBeGreaterThan(before);
			expect(mid).toBeLessThan(after);
			after = mid;
		}
	});

	it('goes just below the sole neighbor when dropped at the start of a list', () => {
		expect(computeMidpointSortOrder(undefined, 5)).toBe(4);
	});

	it('goes just above the sole neighbor when dropped at the end of a list', () => {
		expect(computeMidpointSortOrder(5, undefined)).toBe(6);
	});

	it('defaults to 0 for the first item in an empty list', () => {
		expect(computeMidpointSortOrder(undefined, undefined)).toBe(0);
	});
});
