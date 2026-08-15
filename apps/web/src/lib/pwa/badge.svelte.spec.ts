import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/api/lists', () => ({ fetchLists: vi.fn() }));

const { fetchLists } = await import('$lib/api/lists');
const {
	clearBadge,
	getBadgeCount,
	isBadgingSupported,
	onBadgeCountChange,
	refreshBadgeCount,
	resetBadgeForTesting
} = await import('./badge');

function stubBadgingApi() {
	const setAppBadge = vi.fn().mockResolvedValue(undefined);
	const clearAppBadge = vi.fn().mockResolvedValue(undefined);
	Object.defineProperty(window.navigator, 'setAppBadge', {
		value: setAppBadge,
		configurable: true
	});
	Object.defineProperty(window.navigator, 'clearAppBadge', {
		value: clearAppBadge,
		configurable: true
	});
	return { setAppBadge, clearAppBadge };
}

afterEach(() => {
	resetBadgeForTesting();
	onBadgeCountChange(null);
	vi.clearAllMocks();
	Reflect.deleteProperty(window.navigator, 'setAppBadge');
	Reflect.deleteProperty(window.navigator, 'clearAppBadge');
});

describe('isBadgingSupported', () => {
	it('is true once the Badging API is stubbed onto navigator', () => {
		stubBadgingApi();
		expect(isBadgingSupported()).toBe(true);
	});

	it('is false when the Badging API is absent from navigator', () => {
		// Chromium (this test's real browser) ships setAppBadge on the Navigator
		// prototype, so shadowing an own `undefined` property can't hide it from
		// `in` — stub out `navigator` entirely instead.
		vi.stubGlobal('navigator', { userAgent: window.navigator.userAgent });
		expect(isBadgingSupported()).toBe(false);
		vi.unstubAllGlobals();
	});
});

describe('refreshBadgeCount', () => {
	it('sums uncompleted items across eligible lists, excluding archived and badge-excluded ones', async () => {
		const { setAppBadge } = stubBadgingApi();
		vi.mocked(fetchLists).mockResolvedValue([
			{ id: 1, itemCount: 3, archived: false, badgeExcluded: false },
			{ id: 2, itemCount: 5, archived: true, badgeExcluded: false },
			{ id: 3, itemCount: 7, archived: false, badgeExcluded: true },
			{ id: 4, itemCount: 2, archived: false, badgeExcluded: false }
		] as never);

		await refreshBadgeCount();

		expect(setAppBadge).toHaveBeenCalledWith(5);
		expect(getBadgeCount()).toBe(5);
	});

	it('clears the badge when the eligible total is zero', async () => {
		const { clearAppBadge } = stubBadgingApi();
		vi.mocked(fetchLists).mockResolvedValue([]);

		await refreshBadgeCount();

		expect(clearAppBadge).toHaveBeenCalled();
		expect(getBadgeCount()).toBe(0);
	});

	it('notifies the in-app fallback listener without touching the Badging API when unsupported', async () => {
		// Chromium (this test's real browser) ships setAppBadge on the Navigator
		// prototype, so shadowing an own `undefined` property can't hide it from
		// `in` — stub out `navigator` entirely instead.
		vi.stubGlobal('navigator', { userAgent: window.navigator.userAgent });
		vi.mocked(fetchLists).mockResolvedValue([
			{ id: 1, itemCount: 4, archived: false, badgeExcluded: false }
		] as never);
		const listener = vi.fn();
		onBadgeCountChange(listener);

		await refreshBadgeCount();

		expect(listener).toHaveBeenCalledWith(4);
		expect(getBadgeCount()).toBe(4);
		vi.unstubAllGlobals();
	});

	it('leaves the existing badge as-is when the fetch fails', async () => {
		stubBadgingApi();
		vi.mocked(fetchLists).mockResolvedValue([
			{ id: 1, itemCount: 4, archived: false, badgeExcluded: false }
		] as never);
		await refreshBadgeCount();
		expect(getBadgeCount()).toBe(4);

		vi.mocked(fetchLists).mockRejectedValue(new TypeError('network down'));
		await refreshBadgeCount();

		expect(getBadgeCount()).toBe(4);
	});

	it('swallows a setAppBadge rejection (e.g. not installed as a PWA yet)', async () => {
		const { setAppBadge } = stubBadgingApi();
		setAppBadge.mockRejectedValue(new Error('not available'));
		vi.mocked(fetchLists).mockResolvedValue([
			{ id: 1, itemCount: 1, archived: false, badgeExcluded: false }
		] as never);

		await expect(refreshBadgeCount()).resolves.toBeUndefined();
		expect(getBadgeCount()).toBe(1);
	});
});

describe('clearBadge', () => {
	it('sets the count to 0 and notifies listeners', () => {
		const { clearAppBadge } = stubBadgingApi();
		const listener = vi.fn();
		onBadgeCountChange(listener);

		clearBadge();

		expect(listener).toHaveBeenCalledWith(0);
		expect(clearAppBadge).toHaveBeenCalled();
	});
});
