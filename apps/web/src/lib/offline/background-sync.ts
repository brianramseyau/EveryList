import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { ListDto } from '@everylist/shared';
import { fetchCategories } from '$lib/api/categories';
import { fetchFavorites } from '$lib/api/favorites';
import { fetchFolders } from '$lib/api/folders';
import { fetchItems, fetchRecentItems } from '$lib/api/items';
import { fetchList, fetchLists } from '$lib/api/lists';
import { getSelectedStoreSettings } from '$lib/api/selected-store';
import { fetchStoreCategoryOrder, fetchStores } from '$lib/api/stores';
import { connectivity } from './connectivity.svelte';

const SYNC_INTERVAL_MS = 5 * 60_000;

let syncInterval: ReturnType<typeof setInterval> | null = null;
let appStateListener: ReturnType<typeof App.addListener> | null = null;
let started = false;

/**
 * Refreshes every list's offline cache, not just the one currently open — a follow-up to the
 * per-fetcher cache fallback (PHASE13_PLAN.md §8), which only helps a list that's already been
 * visited at least once. Mirrors `routes/lists/[id]/+page.svelte`'s own `loadAll()` per list, plus
 * favorites and recently-deleted items — screens reached from that page's own toolbar links but
 * never warmed by visiting it — so the cache ends up in the same state a real visit to every one
 * of those screens would have left it in.
 *
 * Deliberately sequential across lists (not `Promise.all` over the whole set) — with an unbounded
 * number of lists, firing every list's fetches at once on every interval would spike request
 * count and battery/data use for no real benefit; a plain loop keeps the cost proportional.
 */
async function syncAllLists(): Promise<void> {
	if (connectivity.serverUnavailable) return;

	let lists: ListDto[];
	try {
		[lists] = await Promise.all([fetchLists(), fetchFolders()]);
	} catch {
		return;
	}

	for (const list of lists) {
		if (list.archived) continue;
		try {
			await Promise.all([
				fetchList(list.id),
				fetchCategories(list.id),
				fetchItems(list.id),
				fetchStores(list.id),
				fetchFavorites(list.id),
				fetchRecentItems(list.id)
			]);
			const { storeId } = await getSelectedStoreSettings(list.id);
			if (storeId !== null) await fetchStoreCategoryOrder(storeId);
		} catch {
			// One list's failure (e.g. access revoked mid-loop) shouldn't block the rest.
		}
	}
}

/**
 * Starts the periodic background sync: an immediate warm, then every `SYNC_INTERVAL_MS` while the
 * app is open, plus once on every native resume-from-background (no equivalent trigger exists on
 * the web build — `appStateChange` is a Capacitor-only event). There's no true OS-level background
 * task here (unlike AnyList's native app, this hybrid app's Dexie/IndexedDB cache lives inside the
 * WebView's own storage, which a native background task can't reach while the app is fully
 * closed) — this only runs while the app is actually open. Call once, e.g. from the root layout;
 * safe to call from a server-rendering context (no-ops without `window`).
 */
export function startBackgroundSync(): void {
	if (started || typeof window === 'undefined') return;
	started = true;

	syncInterval = setInterval(() => void syncAllLists(), SYNC_INTERVAL_MS);
	appStateListener = Capacitor.isNativePlatform()
		? App.addListener('appStateChange', ({ isActive }) => {
				if (isActive) void syncAllLists();
			})
		: null;

	void syncAllLists();
}

/** Test-only: resets the module-level scheduling state between specs. */
export function resetBackgroundSyncForTesting(): void {
	if (syncInterval) clearInterval(syncInterval);
	syncInterval = null;
	void appStateListener?.then((handle) => handle.remove());
	appStateListener = null;
	started = false;
}
