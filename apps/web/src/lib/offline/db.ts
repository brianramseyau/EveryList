import Dexie, { type Table } from 'dexie';
import type {
	ListDto,
	CategoryDto,
	ItemDto,
	FavoriteItemDto,
	StoreDto,
	StoreCategoryOrderDto,
	FolderDto
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
	/** `reorder`: a bulk operation touching every row in the scope (a list's categories, a
	 * store's category order) — see PHASE13_PLAN.md §5. `attach`: a join/create-by-reference
	 * operation (attaching an existing store, adding a favorite to a list) where the server
	 * computes the resulting row — same optimistic-temp-id-then-replace shape as `create`,
	 * kept as a distinct label only so the sync-status page can describe it accurately.
	 * `restore`: clears a soft-deleted row's `deletedAt` via its dedicated POST endpoint —
	 * same single-row optimistic-then-replay shape as `update`, but a distinct label since it
	 * replays via POST (the item's regular PATCH endpoint only operates on non-deleted rows). */
	op: 'create' | 'update' | 'delete' | 'reorder' | 'attach' | 'restore';
	/** The real server id, or a negative client-generated temp id for a queued create/attach — or,
	 * for `reorder`, the scope id (a list id for a category reorder, a store id for a store's
	 * category order), since there's no single row to key a bulk operation on. */
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

export type OfflineList = ListDto &
	OfflineBookkeeping & {
		/** Position in the most recent successful `fetchLists` response. `ListDto` carries no
		 * server-exposed sort field of its own (unlike `CategoryDto`/`ItemDto`/`FolderDto`, which
		 * all have `sortOrder` — `reorderLists` reorders per-user server state that never round-trips
		 * back onto the DTO), so this is the only way the offline fallback in `lists.ts`'s
		 * `fetchLists` can reproduce the user's chosen order while the network is down. Not set by
		 * `fetchList`, which must not disturb a row's already-known position when it re-puts just
		 * that one row. */
		_localSortOrder?: number;
	};
export type OfflineCategory = CategoryDto & OfflineBookkeeping;
export type OfflineItem = ItemDto & OfflineBookkeeping;
export type OfflineFavoriteItem = FavoriteItemDto & OfflineBookkeeping;
export type OfflineStore = StoreDto & OfflineBookkeeping;
export type OfflineStoreCategoryOrder = StoreCategoryOrderDto & OfflineBookkeeping;
/** Folders are never written by the offline sync engine — there's no `'folder'` `SyncEntityType`,
 * folder writes stay online-only (see PHASE13_PLAN.md §8's scope note) — so there's no `_dirty`
 * bookkeeping to carry, unlike the other cached entities above. */
export type OfflineFolder = FolderDto;

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
	folders!: Table<OfflineFolder, number>;

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
		this.version(3).stores({
			folders: 'id'
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

/** Entity types with a cached table that tracks a `_dirty` flag — `list` is never written by the
 * offline sync engine (see offline/flush.ts's `QueueableEntityType`), so it never has an unacked
 * local edit. `store_category_order` is compound-keyed ([storeId+categoryId], no single row per
 * `entityId`), so its dirty check is "does *any* row for this store have an unacked edit" —
 * `entityId` here is the store id, matching the `entityId` the backend broadcasts for a store's
 * category-reorder event (stores_controller.ts's `reorderCategories`). */
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
		case 'store_category_order': {
			const dirtyCount = await db.storeCategoryOrders
				.where('storeId')
				.equals(entityId)
				.filter((row) => row._dirty === true)
				.count();
			return dirtyCount > 0;
		}
		case 'list':
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
