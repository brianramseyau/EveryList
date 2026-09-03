import { describe, expect, it } from 'vitest';
import type { ItemDto, ListDto } from '@everylist/shared';
import { computeScheduledDeadlines } from './scheduled-deadlines';

function makeList(overrides: Partial<ListDto> = {}): ListDto {
	return {
		id: 1,
		name: 'Chores',
		color: '#000000',
		icon: null,
		ownerId: 1,
		useDeadline: true,
		...overrides
	} as ListDto;
}

function makeItem(overrides: Partial<ItemDto> = {}): ItemDto {
	return {
		id: 1,
		listId: 1,
		name: 'Return library book',
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

describe('computeScheduledDeadlines', () => {
	const now = new Date(2026, 8, 5, 12, 0);

	it('schedules a future datetime deadline at its exact time', () => {
		const list = makeList();
		const item = makeItem({ deadline: '2026-09-05T14:30' });
		const result = computeScheduledDeadlines([list], new Map([[1, [item]]]), now);

		expect(result).toEqual([
			{
				itemId: 1,
				listId: 1,
				title: 'Required by',
				body: 'Return library book',
				at: new Date(2026, 8, 5, 14, 30)
			}
		]);
	});

	it('schedules a future date-only deadline at 9am that day', () => {
		const list = makeList();
		const item = makeItem({ deadline: '2026-09-06' });
		const result = computeScheduledDeadlines([list], new Map([[1, [item]]]), now);

		expect(result).toEqual([
			{
				itemId: 1,
				listId: 1,
				title: 'Required by',
				body: 'Return library book',
				at: new Date(2026, 8, 6, 9, 0)
			}
		]);
	});

	it('skips a list with useDeadline off', () => {
		const list = makeList({ useDeadline: false });
		const item = makeItem({ deadline: '2026-09-06' });
		expect(computeScheduledDeadlines([list], new Map([[1, [item]]]), now)).toEqual([]);
	});

	it('skips an item with no deadline', () => {
		const list = makeList();
		const item = makeItem({ deadline: null });
		expect(computeScheduledDeadlines([list], new Map([[1, [item]]]), now)).toEqual([]);
	});

	it('skips a checked item', () => {
		const list = makeList();
		const item = makeItem({ deadline: '2026-09-06', checked: true });
		expect(computeScheduledDeadlines([list], new Map([[1, [item]]]), now)).toEqual([]);
	});

	it('skips an already-due/overdue deadline (no retroactive local notification)', () => {
		const list = makeList();
		const item = makeItem({ deadline: '2026-09-05T09:00' });
		expect(computeScheduledDeadlines([list], new Map([[1, [item]]]), now)).toEqual([]);
	});

	it('skips a list with no fetched items', () => {
		const list = makeList();
		expect(computeScheduledDeadlines([list], new Map(), now)).toEqual([]);
	});
});
