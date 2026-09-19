import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getExpandedSubtaskIds,
	getShowChecked,
	setExpandedSubtaskIds,
	setShowChecked
} from './list-prefs';

// Runs in the "client" (real Chromium) project so `window.localStorage` is
// the genuine browser implementation — see list-prefs.spec.ts for the
// SSR/no-window guard.
describe('list-prefs (browser)', () => {
	afterEach(() => {
		window.localStorage.clear();
	});

	it('defaults to showing checked items when nothing has been stored', () => {
		expect(getShowChecked(7)).toBe(true);
	});

	it('remembers the choice for that exact list, not others', () => {
		setShowChecked(7, false);
		expect(getShowChecked(7)).toBe(false);
		expect(getShowChecked(8)).toBe(true);
	});

	it('setShowChecked(true) round-trips back to the default state', () => {
		setShowChecked(7, false);
		setShowChecked(7, true);
		expect(getShowChecked(7)).toBe(true);
	});

	it('defaults to no expanded sub-task panels when nothing has been stored', () => {
		expect(getExpandedSubtaskIds(7)).toEqual([]);
	});

	it('remembers expanded sub-task ids for that exact list, not others', () => {
		setExpandedSubtaskIds(7, [10, 20]);
		expect(getExpandedSubtaskIds(7)).toEqual([10, 20]);
		expect(getExpandedSubtaskIds(8)).toEqual([]);
	});

	it('treats malformed stored JSON as no expanded ids', () => {
		window.localStorage.setItem('everylist:expandedSubtasks:7', '{not json');
		expect(getExpandedSubtaskIds(7)).toEqual([]);
	});

	it('treats stored JSON that is not an array as no expanded ids', () => {
		window.localStorage.setItem('everylist:expandedSubtasks:7', '{"foo":"bar"}');
		expect(getExpandedSubtaskIds(7)).toEqual([]);
	});

	it('drops non-number entries from stored expanded ids', () => {
		window.localStorage.setItem('everylist:expandedSubtasks:7', '[1,"two",3]');
		expect(getExpandedSubtaskIds(7)).toEqual([1, 3]);
	});

	it('silently gives up when localStorage.setItem throws (e.g. quota exceeded)', () => {
		const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
			throw new Error('quota exceeded');
		});
		expect(() => setExpandedSubtaskIds(7, [1])).not.toThrow();
		setItem.mockRestore();
	});
});
