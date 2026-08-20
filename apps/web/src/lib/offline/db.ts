import Dexie, { type Table } from 'dexie';
import type {
	ListDto,
	CategoryDto,
	ItemDto,
	FavoriteItemDto,
	StoreDto,
	StoreCategoryOrderDto
} from '@everylist/shared';

/**
 * Entity types the offline sync queue can target — mirrors
 * `SyncEventDto['entityType']` (see PHASE5_PLAN.md §3).
 */
export type SyncEntityType =
	'list' | 'category' | 'item' | 'favorite_item' | 'store' | 'store_category_order';

export interface QueuedMutation {
	id?: number;
	entityType: SyncEntityType;
	op: 'create' | 'update' | 'delete';
	/** The real server id, or a negative client-generated temp id for a queued create. */
	targetId: number;
	/** `null` for a queued create — there's nothing to conflict against yet. */
	expectedVersion: number | null;
	payload: Record<string, unknown>;
	/** The exact request path to replay against — lets the flush loop (offline/flush.ts) issue
	 * the request generically, without an entity-specific URL dispatch table. */
	url: string;
	status: 'pending' | 'sending' | 'conflict' | 'failed';
	attempts: number;
	createdAt: number;
	lastError?: string;
}

/** Which items to show when a store is selected — see PLAN.md §7 (store aisle
 * order and item filtering are decoupled). */
export type StoreFilter = 'all' | 'store' | 'storeAndUnassigned';

export interface SelectedStoreRow {
	listId: number;
	storeId: number | null;
	/** Which items to show relative to `storeId`. */
	filter?: StoreFilter;
	/** Legacy field superseded by `filter` — kept only so old rows migrate on read. */
	includeUnassigned?: boolean;
}

/** The persisted, per-list "shopping here" settings stored in the `selectedStore` row. */
export interface SelectedStoreSettings {
	/** The store whose aisle order arranges categories (also the header icon's store). */
	storeId: number | null;
	/** Which items to show: everything, only the store's, or the store's plus unassigned. */
	filter: StoreFilter;
}

/**
 * Extra bookkeeping on every cached-entity row: `_localId` marks a row
 * created offline before the server has assigned a real id, `_dirty` marks
 * a row with an unacked queued mutation against it — used to suppress a
 * racing realtime event from overwriting an in-flight local edit.
 */
interface OfflineBookkeeping {
	_localId?: string;
	_dirty?: boolean;
}

export type OfflineList = ListDto & OfflineBookkeeping;
export type OfflineCategory = CategoryDto & OfflineBookkeeping;
export type OfflineItem = ItemDto & OfflineBookkeeping;
export type OfflineFavoriteItem = FavoriteItemDto & OfflineBookkeeping;
export type OfflineStore = StoreDto & OfflineBookkeeping;
export type OfflineStoreCategoryOrder = StoreCategoryOrderDto & OfflineBookkeeping;

export class EveryListDB extends Dexie {
	lists!: Table<OfflineList, number>;
	categories!: Table<OfflineCategory, number>;
	items!: Table<OfflineItem, number>;
	favoriteItems!: Table<OfflineFavoriteItem, number>;
	stores!: Table<OfflineStore, number>;
	storeCategoryOrders!: Table<OfflineStoreCategoryOrder, [number, number]>;
	/** The local-only "currently shopping at" selection — never touches syncQueue, see PLAN.md §7/§9. */
	selectedStore!: Table<SelectedStoreRow, number>;
	syncQueue!: Table<QueuedMutation, number>;

	constructor() {
		super('everylist');
		this.version(1).stores({
			lists: 'id',
			categories: 'id, listId',
			items: 'id, [listId+deletedAt], categoryId',
			favoriteItems: 'id, listId',
			stores: 'id',
			storeCategoryOrders: '[storeId+categoryId], storeId',
			selectedStore: 'listId',
			syncQueue: '++id, status, createdAt'
		});
		this.version(2).stores({
			items: 'id, [listId+deletedAt], categoryId, storeId'
		});
	}
}

/** Guards every Dexie access — false during SvelteKit's prerender/SSR pass
 * (no `indexedDB` global) and in the small handful of test files that never
 * install the fake-indexeddb polyfill. */
export function hasIndexedDb(): boolean {
	return typeof indexedDB !== 'undefined';
}

let instance: EveryListDB | null = null;

/** Lazily constructs the singleton Dexie database, or returns `null` when
 * no IndexedDB implementation is available (see `hasIndexedDb`). */
export function getDb(): EveryListDB | null {
	if (!hasIndexedDb()) return null;
	if (!instance) instance = new EveryListDB();
	return instance;
}

/** Entity types with a cached table that tracks a `_dirty` flag — `list` and
 * `store_category_order` are never written by the offline sync engine (see
 * offline/flush.ts's `QueueableEntityType`), so they never have an unacked local edit. */
export async function isRowDirty(entityType: SyncEntityType, entityId: number): Promise<boolean> {
	const db = getDb();
	if (!db) return false;
	switch (entityType) {
		case 'item':
			return Boolean((await db.items.get(entityId))?._dirty);
		case 'category':
			return Boolean((await db.categories.get(entityId))?._dirty);
		case 'favorite_item':
			return Boolean((await db.favoriteItems.get(entityId))?._dirty);
		case 'store':
			return Boolean((await db.stores.get(entityId))?._dirty);
		case 'list':
		case 'store_category_order':
			return false;
	}
}

/** Test-only: deletes the underlying database and drops the singleton so each spec starts clean. */
export async function resetDbForTesting(): Promise<void> {
	if (instance) {
		instance.close();
		await instance.delete();
	}
	instance = null;
}
