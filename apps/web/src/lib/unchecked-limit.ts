import type { ListDto } from '@everylist/shared';

/**
 * Per-list unchecked-item ("open item") cap — see PLAN_25_PHASE_OPEN_ITEM_LIMIT.md.
 * Pure helpers shared by every gated UI entry point; the gate reads the
 * Dexie-backed in-memory state, so it works fully offline (the server-side check
 * in `apps/api`'s `unchecked_limit.ts` backstops stale local counts).
 */

/** The minimal shape of a list row these helpers need. */
export type OpenItemList = Pick<ListDto, 'maxUncheckedItems'> | null | undefined;

/** The minimal shape of an item row these helpers need (deleted rows never count). */
export interface CheckableItem {
	checked: boolean;
	deletedAt: string | null;
}

/** The list's cap, or `null` when unlimited (missing = pre-Phase-25 row or explicit null). */
export function openItemLimit(list: OpenItemList): number | null {
	return list?.maxUncheckedItems ?? null;
}

/** Unchecked, non-deleted items — the count the cap limits. */
export function uncheckedCount(items: CheckableItem[]): number {
	return items.filter((item) => !item.checked && item.deletedAt === null).length;
}

/** Whether the list is at (or over) its cap — new intake should be blocked. */
export function isAtLimit(list: OpenItemList, items: CheckableItem[]): boolean {
	const max = openItemLimit(list);
	if (max === null) return false;
	return uncheckedCount(items) >= max;
}

/** Slots left before the cap, or `null` when unlimited. Never negative. */
export function remainingSlots(list: OpenItemList, items: CheckableItem[]): number | null {
	const max = openItemLimit(list);
	if (max === null) return null;
	return Math.max(0, max - uncheckedCount(items));
}
