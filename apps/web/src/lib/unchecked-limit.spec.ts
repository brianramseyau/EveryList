import { describe, expect, it } from 'vitest';
import { isAtLimit, openItemLimit, remainingSlots, uncheckedCount } from './unchecked-limit';
import type { ListDto } from '@everylist/shared';

function makeList(maxUncheckedItems: number | null | undefined): ListDto {
	return {
		id: 1,
		name: 'Todos',
		color: '#3b82f6',
		icon: null,
		ownerId: 1,
		folderId: null,
		archived: false,
		badgeExcluded: false,
		passcodeHash: null,
		itemCount: 0,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: null,
		version: 1,
		maxUncheckedItems
	};
}

function item(overrides: Partial<{ checked: boolean; deletedAt: string | null }> = {}) {
	return { checked: false, deletedAt: null, ...overrides };
}

describe('openItemLimit', () => {
	it('returns the cap when set', () => {
		expect(openItemLimit(makeList(5))).toBe(5);
	});

	it('returns null when the cap is null or missing (unlimited)', () => {
		expect(openItemLimit(makeList(null))).toBeNull();
		expect(openItemLimit(makeList(undefined))).toBeNull();
		expect(openItemLimit(null)).toBeNull();
		expect(openItemLimit(undefined)).toBeNull();
	});
});

describe('uncheckedCount', () => {
	it('counts only unchecked, non-deleted items', () => {
		const items = [
			item(),
			item({ checked: true }),
			item({ deletedAt: '2026-01-02T00:00:00.000Z' }),
			item({ checked: true, deletedAt: '2026-01-02T00:00:00.000Z' }),
			item()
		];
		expect(uncheckedCount(items)).toBe(2);
	});

	it('returns 0 for an empty list', () => {
		expect(uncheckedCount([])).toBe(0);
	});
});

describe('isAtLimit', () => {
	it('is false when the list has no limit', () => {
		expect(isAtLimit(makeList(null), [item(), item()])).toBe(false);
		expect(isAtLimit(undefined, [item(), item()])).toBe(false);
	});

	it('is false under the limit', () => {
		expect(isAtLimit(makeList(3), [item(), item()])).toBe(false);
	});

	it('is true at the limit', () => {
		expect(isAtLimit(makeList(2), [item(), item()])).toBe(true);
	});

	it('is true over the limit (lowered below the current count)', () => {
		expect(isAtLimit(makeList(1), [item(), item(), item()])).toBe(true);
	});

	it('ignores checked items toward the limit', () => {
		expect(isAtLimit(makeList(1), [item({ checked: true })])).toBe(false);
	});
});

describe('remainingSlots', () => {
	it('returns null when unlimited', () => {
		expect(remainingSlots(makeList(null), [item()])).toBeNull();
		expect(remainingSlots(undefined, [item()])).toBeNull();
	});

	it('counts down and floors at zero', () => {
		expect(remainingSlots(makeList(3), [item()])).toBe(2);
		expect(remainingSlots(makeList(3), [item(), item(), item()])).toBe(0);
		expect(remainingSlots(makeList(1), [item(), item(), item()])).toBe(0);
	});
});
