import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSelfMutation, markSelfMutation, resetSelfMutationsForTesting } from './self-mutations';

describe('self-mutations', () => {
	afterEach(() => {
		resetSelfMutationsForTesting();
		vi.useRealTimers();
	});

	it('returns false when nothing was marked', () => {
		expect(isSelfMutation('item', 1)).toBe(false);
	});

	it('returns true for a freshly marked mutation and consumes the mark', () => {
		markSelfMutation('item', 1);

		expect(isSelfMutation('item', 1)).toBe(true);
		expect(isSelfMutation('item', 1)).toBe(false);
	});

	it('tracks different entities independently', () => {
		markSelfMutation('item', 1);

		expect(isSelfMutation('item', 2)).toBe(false);
		expect(isSelfMutation('item', 1)).toBe(true);
	});

	it('ignores a mark once the suppression window has elapsed', () => {
		vi.useFakeTimers();
		markSelfMutation('item', 1);

		vi.advanceTimersByTime(10_001);

		expect(isSelfMutation('item', 1)).toBe(false);
	});
});
