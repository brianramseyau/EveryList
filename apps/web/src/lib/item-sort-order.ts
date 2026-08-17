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
