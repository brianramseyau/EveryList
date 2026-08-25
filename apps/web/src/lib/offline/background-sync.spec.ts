import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListDto } from '@everylist/shared';

vi.mock('$lib/api/lists', () => ({ fetchLists: vi.fn(), fetchList: vi.fn() }));
vi.mock('$lib/api/folders', () => ({ fetchFolders: vi.fn() }));
vi.mock('$lib/api/categories', () => ({ fetchCategories: vi.fn() }));
vi.mock('$lib/api/items', () => ({ fetchItems: vi.fn(), fetchRecentItems: vi.fn() }));
vi.mock('$lib/api/favorites', () => ({ fetchFavorites: vi.fn() }));
vi.mock('$lib/api/stores', () => ({
	fetchStores: vi.fn(),
	fetchStoreCategoryOrder: vi.fn()
}));
vi.mock('$lib/api/selected-store', () => ({ getSelectedStoreSettings: vi.fn() }));
vi.mock('$lib/offline/connectivity.svelte', () => ({
	connectivity: {
		get serverUnavailable() {
			return false;
		}
	}
}));
vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: vi.fn().mockReturnValue(false) }
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

const { fetchLists, fetchList } = await import('$lib/api/lists');
const { fetchFolders } = await import('$lib/api/folders');
const { fetchCategories } = await import('$lib/api/categories');
const { fetchItems, fetchRecentItems } = await import('$lib/api/items');
const { fetchFavorites } = await import('$lib/api/favorites');
const { fetchStores, fetchStoreCategoryOrder } = await import('$lib/api/stores');
const { getSelectedStoreSettings } = await import('$lib/api/selected-store');
const { Capacitor } = await import('@capacitor/core');
const { App } = await import('@capacitor/app');
const connectivityModule = await import('$lib/offline/connectivity.svelte');
const { startBackgroundSync, resetBackgroundSyncForTesting } = await import('./background-sync');

function listDto(id: number, archived = false): ListDto {
	return {
		id,
		name: `List ${id}`,
		color: '#3b82f6',
		icon: null,
		ownerId: 1,
		folderId: null,
		archived,
		badgeExcluded: false,
		passcodeHash: null,
		itemCount: 0,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: null,
		version: 1
	};
}

describe('background-sync', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		(globalThis as { window?: unknown }).window = new EventTarget();
		vi.mocked(fetchLists).mockResolvedValue([listDto(1)]);
		vi.mocked(fetchFolders).mockResolvedValue([]);
		vi.mocked(fetchList).mockResolvedValue(listDto(1));
		vi.mocked(fetchCategories).mockResolvedValue([]);
		vi.mocked(fetchItems).mockResolvedValue([]);
		vi.mocked(fetchRecentItems).mockResolvedValue([]);
		vi.mocked(fetchFavorites).mockResolvedValue([]);
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([]);
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({ storeId: null, filter: 'store' });
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
		vi.spyOn(connectivityModule.connectivity, 'serverUnavailable', 'get').mockReturnValue(false);
	});

	afterEach(() => {
		resetBackgroundSyncForTesting();
		delete (globalThis as { window?: unknown }).window;
		vi.useRealTimers();
		vi.resetAllMocks();
	});

	it('warms every non-archived list on start', async () => {
		vi.mocked(fetchLists).mockResolvedValue([listDto(1), listDto(2, true), listDto(3)]);

		startBackgroundSync();
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchList).toHaveBeenCalledWith(1);
		expect(fetchList).toHaveBeenCalledWith(3);
		expect(fetchList).not.toHaveBeenCalledWith(2);
		expect(fetchCategories).toHaveBeenCalledWith(1);
		expect(fetchItems).toHaveBeenCalledWith(1);
		expect(fetchStores).toHaveBeenCalledWith(1);
		expect(fetchFavorites).toHaveBeenCalledWith(1);
		expect(fetchRecentItems).toHaveBeenCalledWith(1);
	});

	it('fetches the store category order only when a store is selected', async () => {
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({ storeId: 7, filter: 'store' });

		startBackgroundSync();
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchStoreCategoryOrder).toHaveBeenCalledWith(7);
	});

	it('does not fetch the store category order when no store is selected', async () => {
		startBackgroundSync();
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchStoreCategoryOrder).not.toHaveBeenCalled();
	});

	it('re-syncs on an interval while running', async () => {
		startBackgroundSync();
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchLists).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(5 * 60_000);
		expect(fetchLists).toHaveBeenCalledTimes(2);
	});

	it('skips the run entirely when already known offline', async () => {
		vi.spyOn(connectivityModule.connectivity, 'serverUnavailable', 'get').mockReturnValue(true);

		startBackgroundSync();
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchLists).not.toHaveBeenCalled();
	});

	it('stops after the lists index itself fails to load and cache', async () => {
		vi.mocked(fetchLists).mockRejectedValue(new TypeError('Failed to fetch'));

		startBackgroundSync();
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchList).not.toHaveBeenCalled();
	});

	it("continues past one list's failure to the next", async () => {
		vi.mocked(fetchLists).mockResolvedValue([listDto(1), listDto(2)]);
		vi.mocked(fetchCategories).mockRejectedValueOnce(new Error('boom'));

		startBackgroundSync();
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchList).toHaveBeenCalledWith(2);
		expect(fetchItems).toHaveBeenCalledWith(2);
	});

	it('registers an appStateChange listener on native and syncs on resume', async () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		let stateHandler: ((state: { isActive: boolean }) => void) | undefined;
		vi.mocked(App.addListener).mockImplementation((_event, handler) => {
			stateHandler = handler as unknown as (state: { isActive: boolean }) => void;
			return Promise.resolve({ remove: vi.fn() });
		});

		startBackgroundSync();
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchLists).toHaveBeenCalledTimes(1);

		stateHandler?.({ isActive: true });
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchLists).toHaveBeenCalledTimes(2);
	});

	it('does not re-sync when appStateChange fires with isActive false', async () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		let stateHandler: ((state: { isActive: boolean }) => void) | undefined;
		vi.mocked(App.addListener).mockImplementation((_event, handler) => {
			stateHandler = handler as unknown as (state: { isActive: boolean }) => void;
			return Promise.resolve({ remove: vi.fn() });
		});

		startBackgroundSync();
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchLists).toHaveBeenCalledTimes(1);

		stateHandler?.({ isActive: false });
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchLists).toHaveBeenCalledTimes(1);
	});

	it('does not register an appStateChange listener on the web build', async () => {
		startBackgroundSync();
		await vi.advanceTimersByTimeAsync(0);

		expect(App.addListener).not.toHaveBeenCalled();
	});

	it('is idempotent — a second start does not register more work', async () => {
		startBackgroundSync();
		startBackgroundSync();
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchLists).toHaveBeenCalledTimes(1);
	});

	it('resetBackgroundSyncForTesting is safe to call when nothing was started', () => {
		expect(() => resetBackgroundSyncForTesting()).not.toThrow();
	});
});

describe('startBackgroundSync without a window (SSR/prerender)', () => {
	it('is a no-op', () => {
		delete (globalThis as { window?: unknown }).window;
		expect(() => startBackgroundSync()).not.toThrow();
	});
});
