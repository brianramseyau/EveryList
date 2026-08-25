import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFavoriteIcons, recordIconUse } from './favorites';

// Runs in the "client" (real Chromium) project so `window.localStorage` is
// the genuine browser implementation — see favorites.spec.ts for the
// SSR/no-window guard.
//
// Cleared before *and* after each test: the whole client project shares one
// browser/localStorage, and any other spec that exercises IconPicker's pick
// flow (several route specs do, to save a category/list) now records a
// favorite as a side effect — a `beforeEach`-only guard would still be at
// the mercy of run order across files.
describe('favorites (browser)', () => {
	beforeEach(() => {
		window.localStorage.removeItem('everylist:iconFavorites');
	});

	afterEach(() => {
		window.localStorage.removeItem('everylist:iconFavorites');
	});

	it('returns an empty array when nothing is stored', () => {
		expect(getFavoriteIcons()).toEqual([]);
	});

	it('records a picked icon as the most recent favorite', () => {
		recordIconUse('cup');
		expect(getFavoriteIcons()).toEqual(['cup']);
	});

	it('moves a re-picked icon back to the front instead of duplicating it', () => {
		recordIconUse('cup');
		recordIconUse('cheese');
		recordIconUse('cup');
		expect(getFavoriteIcons()).toEqual(['cup', 'cheese']);
	});

	it('caps the tracked list, dropping the oldest entries first', () => {
		for (let i = 0; i < 20; i++) recordIconUse(`icon${i}`);
		const favorites = getFavoriteIcons();
		expect(favorites).toHaveLength(16);
		expect(favorites[0]).toBe('icon19');
		expect(favorites).not.toContain('icon0');
	});
});
