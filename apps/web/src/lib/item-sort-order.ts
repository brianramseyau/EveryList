import type { ItemDto, ListDto } from '@everylist/shared';

// A dragged item's sortOrder used to be overwritten with its flat visible-
// list position (a small integer) — see git history on
// lists/[id]/+page.svelte's handleItemDrop. Every other item kept whatever
// sortOrder it got at creation time (`max(sortOrder)+1`, effectively an
// ever-increasing counter), so a drag routinely collided with an existing
// item's sortOrder. SQLite has no defined tiebreak for `ORDER BY sortOrder
// ASC` on equal values, so the list's order could visibly change on the
// next load even though nothing else touched it — the "random" reordering.
//
// Fix: only the dragged item's own sortOrder ever changes, to a value
// strictly between its new neighbors' *existing* sortOrder values (fractional
// indexing) — never a shared/derived index. No other row is touched, so
// there's nothing to collide with and no fan-out of version bumps to other
// items (this app's offline sync queue does per-row optimistic-locking on
// `version`, so touching every sibling on every drag would risk spurious
// conflicts for concurrent edits on other devices).
export function computeMidpointSortOrder(
	before: number | undefined,
	after: number | undefined
): number {
	if (before === undefined && after === undefined) return 0;
	if (before === undefined) return after! - 1;
	if (after === undefined) return before + 1;
	return (before + after) / 2;
}

// PLAN_24_PHASE_ITEM_DEADLINES.md: 'deadline' ordering — items with a deadline
// first, ascending (ISO 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm' compare correctly as
// plain strings), same-deadline ties broken by name; items without a deadline
// keep their manual rank order at the end. Must mirror the API's
// list_display_order.ts byDeadline so the Alexa display and widget match.
function compareByDeadline(a: ItemDto, b: ItemDto): number {
	if (a.deadline === null && b.deadline === null) return a.sortOrder - b.sortOrder;
	if (a.deadline === null) return 1;
	if (b.deadline === null) return -1;
	return (
		a.deadline.localeCompare(b.deadline) ||
		a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
	);
}

/**
 * Orders one display bucket (a category's items, or a whole flat list) per the
 * list's `itemSortOrder` — sorts **in place** and returns the same array, so
 * callers inside reactive derivations never re-key or replace their bucket
 * containers. 'ranked' (or missing/undefined, the server default) leaves the
 * incoming creation/rank order alone. Shared by the list page's `groups`
 * derived value and `buildShareText` so both always agree.
 */
export function sortItemsWithinBucket(
	items: ItemDto[],
	itemSortOrder: ListDto['itemSortOrder']
): ItemDto[] {
	if (itemSortOrder === 'alphabetical') {
		return items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
	}
	if (itemSortOrder === 'deadline') {
		return items.sort(compareByDeadline);
	}
	return items;
}
