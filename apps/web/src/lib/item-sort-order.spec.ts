import { describe, expect, it } from 'vitest';
import { computeMidpointSortOrder, sortItemsWithinBucket } from './item-sort-order';
import type { ItemDto } from '@everylist/shared';

function makeItem(overrides: Partial<ItemDto> & Pick<ItemDto, 'id' | 'name'>): ItemDto {
	return {
		listId: 1,
		quantity: null,
		notes: null,
		categoryId: null,
		storeId: null,
		price: null,
		deadline: null,
		checked: false,
		checkedAt: null,
		sortOrder: 0,
		createdBy: 1,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: null,
		deletedAt: null,
		version: 1,
		...overrides
	};
}

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

describe('sortItemsWithinBucket', () => {
	it('leaves ranked (and missing) order untouched', () => {
		const items = [
			makeItem({ id: 2, name: 'B', sortOrder: 2 }),
			makeItem({ id: 1, name: 'A', sortOrder: 1 })
		];
		expect(sortItemsWithinBucket(items, 'ranked')).toBe(items);
		expect(sortItemsWithinBucket(items, undefined)).toBe(items);
	});

	it('sorts alphabetically within the bucket', () => {
		const items = [makeItem({ id: 1, name: 'banana' }), makeItem({ id: 2, name: 'Apple' })];
		expect(sortItemsWithinBucket(items, 'alphabetical').map((item) => item.id)).toEqual([2, 1]);
	});

	it('deadline sort: ascending, name tiebreak, no-deadline items last in rank order', () => {
		const items = [
			makeItem({ id: 1, name: 'Bravo', deadline: '2026-09-06', sortOrder: 3 }),
			makeItem({ id: 2, name: 'No deadline, later rank', sortOrder: 9 }),
			makeItem({ id: 3, name: 'Alpha', deadline: '2026-09-06', sortOrder: 1 }),
			makeItem({ id: 4, name: 'Earlier', deadline: '2026-09-05T09:00', sortOrder: 5 }),
			makeItem({ id: 5, name: 'No deadline, earlier rank', sortOrder: 2 })
		];
		expect(sortItemsWithinBucket(items, 'deadline').map((item) => item.id)).toEqual([
			4, 3, 1, 5, 2
		]);
	});

	it('deadline sort sorts in place and returns the same array (no reactive re-keying)', () => {
		const items = [
			makeItem({ id: 1, name: 'Later', deadline: '2026-09-06' }),
			makeItem({ id: 2, name: 'Earlier', deadline: '2026-09-05' })
		];
		const sorted = sortItemsWithinBucket(items, 'deadline');
		expect(sorted).toBe(items);
		expect(items.map((item) => item.id)).toEqual([2, 1]);
	});
});
